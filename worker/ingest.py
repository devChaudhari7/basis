"""Yahoo Finance ingestion and Supabase price persistence for BASIS.

Raw Yahoo responses are saved under ``data/raw/`` at runtime.  The cache is a
failover aid and an audit trail for the delayed EOD data; it is intentionally
not checked into source control.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import date, datetime, timezone
import logging
from pathlib import Path
import re
import time
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from supabase import Client, create_client

from .config import ConfigurationError, Settings, TICKERS


LOGGER = logging.getLogger(__name__)
UPSERT_BATCH_SIZE = 500
READ_PAGE_SIZE = 1_000


def create_supabase_client(settings: Settings) -> Client:
    """Create a worker-only client using the service-role key at runtime."""

    if not settings.has_supabase_credentials:
        raise ConfigurationError("Supabase credentials are required to run the worker.")
    # The service key is never passed to frontend code and is not logged.
    return create_client(settings.supabase_url or "", settings.supabase_service_role_key or "")


def _safe_symbol(symbol: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", symbol)


def _normalise_history(frame: pd.DataFrame) -> pd.DataFrame:
    """Convert a Yahoo response into a date-indexed Close/Volume frame."""

    if frame.empty:
        return pd.DataFrame(columns=["close", "volume"], dtype=float)

    work = frame.copy()
    if isinstance(work.columns, pd.MultiIndex):
        work.columns = [" ".join(str(part) for part in column if part) for column in work.columns]

    close_column = next((column for column in work.columns if str(column).strip().lower() == "close"), None)
    if close_column is None:
        # yfinance occasionally returns a flattened label such as "Close CL=F".
        close_column = next(
            (column for column in work.columns if str(column).strip().lower().startswith("close ")),
            None,
        )
    if close_column is None:
        return pd.DataFrame(columns=["close", "volume"], dtype=float)

    volume_column = next((column for column in work.columns if str(column).strip().lower() == "volume"), None)
    dates = pd.to_datetime(work.index, errors="coerce", utc=True).normalize().tz_localize(None)
    normalised = pd.DataFrame(
        {
            "d": dates,
            "close": pd.to_numeric(work[close_column], errors="coerce").to_numpy(),
            "volume": (
                pd.to_numeric(work[volume_column], errors="coerce").to_numpy()
                if volume_column is not None
                else np.nan
            ),
        }
    )
    normalised = normalised.dropna(subset=["d", "close"])
    normalised = normalised.replace([np.inf, -np.inf], np.nan).dropna(subset=["close"])
    # A response should be one row per session, but retaining the last row is
    # safer than silently averaging duplicate exchange-date records.
    normalised = normalised.groupby("d", as_index=True).last().sort_index()
    return normalised[["close", "volume"]]


def _extract_ticker_frame(download: pd.DataFrame, symbol: str) -> pd.DataFrame:
    """Extract one ticker consistently from yfinance's changing column layouts."""

    if download.empty:
        return pd.DataFrame()
    if not isinstance(download.columns, pd.MultiIndex):
        return download.copy()

    level_zero = set(download.columns.get_level_values(0))
    level_one = set(download.columns.get_level_values(1))
    if symbol in level_zero:
        return download[symbol].copy()
    if symbol in level_one:
        return download.xs(symbol, axis=1, level=1).copy()
    return pd.DataFrame()


def _download_yahoo(symbols: Sequence[str], start_date: date) -> pd.DataFrame:
    """Make one batched daily Yahoo request; retry policy is applied by caller."""

    return yf.download(
        tickers=list(symbols),
        start=start_date.isoformat(),
        interval="1d",
        auto_adjust=False,
        actions=False,
        group_by="ticker",
        threads=False,
        progress=False,
    )


def _download_with_retry(symbols: Sequence[str], settings: Settings) -> pd.DataFrame:
    last_error: Exception | None = None
    for attempt in range(settings.download_retries):
        try:
            data = _download_yahoo(symbols, settings.start_date)
            if data.empty:
                raise RuntimeError("Yahoo Finance returned no rows.")
            return data
        except Exception as exc:  # yfinance exposes transport failures inconsistently.
            last_error = exc
            if attempt == settings.download_retries - 1:
                break
            delay = settings.download_backoff_seconds * (2**attempt)
            LOGGER.warning(
                "Yahoo download failed (attempt %s/%s); retrying in %ss: %s",
                attempt + 1,
                settings.download_retries,
                delay,
                exc,
            )
            time.sleep(delay)
    raise RuntimeError("Yahoo Finance download failed after retries.") from last_error


def _cache_path(cache_dir: Path, symbol: str) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return cache_dir / f"{_safe_symbol(symbol)}_{stamp}.csv"


def _write_cache(cache_dir: Path, symbol: str, history: pd.DataFrame) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    history.to_csv(_cache_path(cache_dir, symbol), index_label="Date")


def _load_cached_history(cache_dir: Path, symbol: str) -> pd.DataFrame:
    """Use the newest locally cached raw response only after a live failure."""

    candidates = sorted(cache_dir.glob(f"{_safe_symbol(symbol)}_*.csv"), reverse=True)
    for candidate in candidates:
        try:
            cached = pd.read_csv(candidate, index_col="Date", parse_dates=["Date"])
            normalised = _normalise_history(cached)
            if not normalised.empty:
                LOGGER.warning("Using cached Yahoo response for %s: %s", symbol, candidate)
                return normalised
        except (OSError, ValueError, pd.errors.ParserError) as exc:
            LOGGER.warning("Ignoring unreadable cache file %s: %s", candidate, exc)
    return pd.DataFrame(columns=["close", "volume"], dtype=float)


def download_histories(
    settings: Settings,
    *,
    symbols: Sequence[str] | None = None,
) -> dict[str, pd.DataFrame]:
    """Download all primary Yahoo histories, cache them, and fail over per symbol."""

    requested = list(symbols or TICKERS.values())
    histories: dict[str, pd.DataFrame] = {}
    try:
        batch = _download_with_retry(requested, settings)
    except RuntimeError as exc:
        LOGGER.error("Batched Yahoo request failed: %s", exc)
        batch = pd.DataFrame()

    for symbol in requested:
        history = _normalise_history(_extract_ticker_frame(batch, symbol))
        if history.empty:
            # A batch can succeed while one Yahoo symbol fails. Retry only that
            # symbol before falling back to its newest raw cache.
            try:
                individual = _download_with_retry([symbol], settings)
                history = _normalise_history(_extract_ticker_frame(individual, symbol))
            except RuntimeError as exc:
                LOGGER.warning("Live history unavailable for %s: %s", symbol, exc)

        if history.empty:
            history = _load_cached_history(settings.raw_cache_dir, symbol)
        else:
            try:
                _write_cache(settings.raw_cache_dir, symbol, history)
            except OSError as exc:
                # Ingestion remains useful if ephemeral runner storage is full.
                LOGGER.warning("Could not cache raw response for %s: %s", symbol, exc)

        if history.empty:
            LOGGER.error("No live or cached data available for %s", symbol)
        else:
            histories[symbol] = history
            LOGGER.info("Prepared %s price rows for %s", len(history), symbol)
    return histories


def _chunks(rows: Sequence[dict[str, Any]], size: int = UPSERT_BATCH_SIZE) -> Iterable[Sequence[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def fetch_instrument_ids(client: Client, symbols: Sequence[str]) -> dict[str, int]:
    """Read seeded instrument IDs and fail clearly if reference data is absent."""

    response = client.table("instruments").select("id,symbol").in_("symbol", list(symbols)).execute()
    mapping = {str(row["symbol"]): int(row["id"]) for row in (response.data or [])}
    missing = sorted(set(symbols) - set(mapping))
    if missing:
        raise RuntimeError(
            "Missing seeded instruments: " + ", ".join(missing) + ". Run worker.seed before ingesting."
        )
    return mapping


def upsert_price_history(client: Client, instrument_id: int, history: pd.DataFrame) -> int:
    """Idempotently persist a single instrument's EOD prices in modest batches."""

    rows: list[dict[str, Any]] = []
    for session, row in history.iterrows():
        close = row.get("close")
        if pd.isna(close):
            continue
        volume = row.get("volume")
        rows.append(
            {
                "instrument_id": instrument_id,
                "d": pd.Timestamp(session).date().isoformat(),
                "close": float(close),
                "volume": None if pd.isna(volume) else float(volume),
            }
        )
    for chunk in _chunks(rows):
        client.table("prices").upsert(list(chunk), on_conflict="instrument_id,d").execute()
    return len(rows)


def ingest_prices(client: Client, settings: Settings) -> dict[str, pd.DataFrame]:
    """Fetch primary data and upsert it into the prices table."""

    histories = download_histories(settings)
    if not histories:
        raise RuntimeError("No Yahoo histories were available; no price rows were written.")
    instrument_ids = fetch_instrument_ids(client, list(histories))
    total = 0
    for symbol, history in histories.items():
        total += upsert_price_history(client, instrument_ids[symbol], history)
    LOGGER.info("Upserted %s EOD price rows across %s instruments", total, len(histories))
    return histories


def load_price_series(
    client: Client,
    instrument_ids: Sequence[int],
    *,
    start_date: date,
) -> dict[int, pd.Series]:
    """Load persisted price histories without filling holidays or missing sessions."""

    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        response = (
            client.table("prices")
            .select("instrument_id,d,close")
            .in_("instrument_id", list(instrument_ids))
            .gte("d", start_date.isoformat())
            .order("d")
            .range(offset, offset + READ_PAGE_SIZE - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)
        if len(page) < READ_PAGE_SIZE:
            break
        offset += READ_PAGE_SIZE

    if not rows:
        return {}
    frame = pd.DataFrame(rows)
    frame["d"] = pd.to_datetime(frame["d"], errors="coerce")
    frame["close"] = pd.to_numeric(frame["close"], errors="coerce")
    frame = frame.dropna(subset=["instrument_id", "d", "close"])
    result: dict[int, pd.Series] = {}
    for instrument_id, group in frame.groupby("instrument_id"):
        series = pd.Series(
            group["close"].to_numpy(dtype=float),
            index=pd.DatetimeIndex(group["d"]),
            dtype=float,
        )
        result[int(instrument_id)] = series[~series.index.duplicated(keep="last")].sort_index()
    return result
