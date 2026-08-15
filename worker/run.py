"""The daily BASIS pipeline: ingest → statistics → signals → alerts → digest.

Run with ``python -m worker.run``.  The job is idempotent: prices and daily
statistics are upserted, signal rows are inserted once per (pair, session),
and only an unnotified latest-session signal can trigger an alert.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date
import logging
import math
from typing import Any

import pandas as pd
from supabase import Client

from .autotrade import manage_pair
from .config import Settings
from .diagnostics import (
    CORRELATION_WINDOW,
    DEFAULT_HORIZONS,
    aggregate_outcomes,
    correlation_matrix,
    detect_structural_breaks,
    signal_outcomes,
)
from .ingest import create_supabase_client, ingest_prices, load_price_series
from .notify import DigestLine, SignalAlert, format_digest, format_signal_message, send_message
from .scanner import FDR_ALPHA, scan_universe
from .seed import pair_metadata, seed_reference_data
from .stats import StatisticsSettings, build_signal_rows, compute_spread_daily


LOGGER = logging.getLogger(__name__)
UPSERT_BATCH_SIZE = 500


def _clean(value: Any) -> Any:
    """Convert NaN/NaT into SQL nulls; Supabase JSON cannot carry NaN."""

    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _spread_rows(pair_id: int, frame: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for session, row in frame.iterrows():
        value = row.get("value")
        if pd.isna(value):
            # value is NOT NULL by design: a session without a computable
            # spread (e.g. the beta warm-up window) is simply not a row.
            continue
        rows.append(
            {
                "pair_id": pair_id,
                "d": pd.Timestamp(session).date().isoformat(),
                "value": float(value),
                "mean_60": _clean(row.get("mean_60")),
                "std_60": _clean(row.get("std_60")),
                "z": _clean(row.get("z")),
                "pct_rank_252": _clean(row.get("pct_rank_252")),
                "half_life": _clean(row.get("half_life")),
                "beta": _clean(row.get("beta")),
                "roll_suspect": bool(row.get("roll_suspect", False)),
                "adf_p": _clean(row.get("adf_p")),
                "z_30": _clean(row.get("z_30")),
                "z_90": _clean(row.get("z_90")),
                "stability": row.get("stability") or "insufficient_data",
            }
        )
    return rows


def _upsert_batches(client: Client, table: str, rows: Sequence[dict[str, Any]], conflict: str) -> None:
    for start in range(0, len(rows), UPSERT_BATCH_SIZE):
        chunk = list(rows[start : start + UPSERT_BATCH_SIZE])
        client.table(table).upsert(chunk, on_conflict=conflict).execute()


def _next_event(client: Client, slug: str, on_or_after: date) -> tuple[str, int] | None:
    response = (
        client.table("events")
        .select("d,label")
        .contains("affects", [slug])
        .gte("d", on_or_after.isoformat())
        .order("d")
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None
    event_date = date.fromisoformat(str(rows[0]["d"]))
    return str(rows[0]["label"]), (event_date - on_or_after).days


def _as_float(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return math.nan
    return result if math.isfinite(result) else math.nan


def _send_signal_alerts(client: Client, settings: Settings, pair_row: dict[str, Any], frame: pd.DataFrame) -> None:
    """Alert on any still-unnotified signal for this pair's latest session."""

    if frame.empty:
        return
    latest_session = pd.Timestamp(frame.index.max()).date()
    response = (
        client.table("signals")
        .select("id,d,z")
        .eq("pair_id", int(pair_row["id"]))
        .eq("notified", False)
        .eq("d", latest_session.isoformat())
        .execute()
    )
    pending = response.data or []
    if not pending:
        return

    meta = pair_metadata().get(str(pair_row["slug"]))
    latest = frame.iloc[-1]
    event = _next_event(client, str(pair_row["slug"]), latest_session)
    alert = SignalAlert(
        slug=str(pair_row["slug"]),
        display_name=meta.display_name if meta else str(pair_row["slug"]).upper(),
        unit=meta.unit if meta else "",
        lookback=int(pair_row.get("lookback") or 60),
        z=_as_float(latest.get("z")),
        value=_as_float(latest.get("value")),
        pct_rank_252=_as_float(latest.get("pct_rank_252")),
        half_life=_as_float(latest.get("half_life")),
        adf_p=_as_float(latest.get("adf_p")),
        z_30=_as_float(latest.get("z_30")),
        z_90=_as_float(latest.get("z_90")),
        stability=str(latest.get("stability") or "insufficient_data"),
        next_event_label=event[0] if event else None,
        next_event_days=event[1] if event else None,
    )
    if send_message(settings, format_signal_message(alert, settings.basis_public_url)):
        for row in pending:
            client.table("signals").update({"notified": True}).eq("id", int(row["id"])).execute()
        LOGGER.info("Alert delivered for %s (%s)", pair_row["slug"], latest_session)
    else:
        LOGGER.warning("Alert for %s stays unnotified; delivery failed or no channel.", pair_row["slug"])


def _live_r(client: Client, trade: dict[str, Any], latest_by_pair: dict[int, dict[str, Any]]) -> float:
    """Mark an open trade against the latest session using entry-day risk.

    Risk is fixed at entry: (stop_z − |entry_z|) × σ₆₀ on the entry session.
    A favourable spread move divided by that risk is the trade's current R.
    """

    pair_id = int(trade["pair_id"])
    latest = latest_by_pair.get(pair_id)
    if latest is None:
        return math.nan
    entry_value = _as_float(trade.get("entry_value"))
    entry_z = _as_float(trade.get("entry_z"))
    stop_z = _as_float(trade.get("stop_z"))
    latest_value = _as_float(latest.get("value"))
    if not all(math.isfinite(v) for v in (entry_value, entry_z, stop_z, latest_value)):
        return math.nan

    entry_day = (
        client.table("spread_daily")
        .select("std_60")
        .eq("pair_id", pair_id)
        .lte("d", str(trade["opened_on"]))
        .order("d", desc=True)
        .limit(1)
        .execute()
    )
    rows = entry_day.data or []
    sigma = _as_float(rows[0].get("std_60")) if rows else math.nan
    risk_points = (stop_z - abs(entry_z)) * sigma
    if not math.isfinite(risk_points) or risk_points <= 0:
        return math.nan
    direction = -1.0 if str(trade.get("direction")) == "short_spread" else 1.0
    return direction * (latest_value - entry_value) / risk_points


def _send_digest(client: Client, settings: Settings, latest_by_pair: dict[int, dict[str, Any]], pairs: list[dict[str, Any]]) -> None:
    meta = pair_metadata()
    as_of = max(
        (str(row.get("d")) for row in latest_by_pair.values() if row.get("d")),
        default=date.today().isoformat(),
    )

    pair_lines: list[DigestLine] = []
    for pair_row in pairs:
        latest = latest_by_pair.get(int(pair_row["id"]))
        label = meta[pair_row["slug"]].display_name if pair_row["slug"] in meta else str(pair_row["slug"]).upper()
        if latest is None:
            pair_lines.append(DigestLine(f"{label}: no data"))
            continue
        z = _as_float(latest.get("z"))
        z_text = f"{z:+.2f}σ" if math.isfinite(z) else "n/a (roll or warm-up)"
        stale = f"  [stale: {latest['d']}]" if str(latest.get("d")) != as_of else ""
        pair_lines.append(DigestLine(f"{label}: {z_text}{stale}"))

    open_trades = (
        client.table("paper_trades").select("*").is_("closed_on", "null").order("opened_on").execute().data or []
    )
    trade_lines: list[DigestLine] = []
    slug_by_id = {int(row["id"]): str(row["slug"]) for row in pairs}
    for trade in open_trades:
        label = slug_by_id.get(int(trade["pair_id"]), "?").upper()
        r = _live_r(client, trade, latest_by_pair)
        r_text = f"{r:+.2f}R" if math.isfinite(r) else "R n/a"
        trade_lines.append(DigestLine(f"{label} {str(trade.get('direction', '')).replace('_', ' ')} · {r_text}"))

    send_message(settings, format_digest(pair_lines, trade_lines, as_of))


def _write_research(
    client: Client,
    pair_id: int,
    frame: pd.DataFrame,
    signal_rows: list[dict[str, Any]],
) -> None:
    """Persist signal outcomes, their aggregates, and structural breaks.

    All three are retrospective descriptions of history. Nothing written here
    feeds back into the z-score or the signal rule.
    """

    if signal_rows:
        directions = {
            pd.Timestamp(str(row["d"])): str(row["direction"]) for row in signal_rows
        }
        outcomes = signal_outcomes(frame, list(directions), directions)

        for outcome in outcomes:
            payload = {
                "fwd_5": _clean(outcome.forward.get(5)),
                "fwd_10": _clean(outcome.forward.get(10)),
                "fwd_20": _clean(outcome.forward.get(20)),
                "mae_20": _clean(outcome.mae),
            }
            if any(value is not None for value in payload.values()):
                client.table("signals").update(payload).eq("pair_id", pair_id).eq(
                    "d", outcome.d.date().isoformat()
                ).execute()

        diagnostics = [
            {"pair_id": pair_id, **row} for row in aggregate_outcomes(outcomes, horizons=DEFAULT_HORIZONS)
        ]
        if diagnostics:
            client.table("signal_diagnostics").upsert(
                diagnostics, on_conflict="pair_id,horizon"
            ).execute()
            LOGGER.info(
                "Signal diagnostics for pair %s: %s",
                pair_id,
                ", ".join(f"{row['horizon']}d n={row['n']} hit={row['hit_rate']:.0f}%" for row in diagnostics),
            )

    breaks = detect_structural_breaks(frame["value"])
    if breaks:
        client.table("structural_breaks").upsert(
            [
                {
                    "pair_id": pair_id,
                    "d": pd.Timestamp(item["d"]).date().isoformat(),
                    "shift": float(item["shift"]),
                    "t_stat": float(item["t_stat"]),
                }
                for item in breaks
            ],
            on_conflict="pair_id,d",
        ).execute()
        LOGGER.info("Detected %s structural break(s) for pair %s", len(breaks), pair_id)


def _write_correlations(
    client: Client, pairs: list[dict[str, Any]], frames: dict[str, pd.DataFrame]
) -> None:
    """Persist rolling cross-pair correlation of daily spread changes."""

    id_by_slug = {str(row["slug"]): int(row["id"]) for row in pairs}
    spreads = {slug: frame["value"] for slug, frame in frames.items() if not frame.empty}
    rows = [
        {
            "pair_a": id_by_slug[row["pair_a"]],
            "pair_b": id_by_slug[row["pair_b"]],
            "window_sessions": int(row["window_sessions"]),
            "corr": float(row["corr"]),
            "n": int(row["n"]),
        }
        for row in correlation_matrix(spreads, window=CORRELATION_WINDOW)
        if row["pair_a"] in id_by_slug and row["pair_b"] in id_by_slug
    ]
    if rows:
        client.table("spread_correlations").upsert(
            rows, on_conflict="pair_a,pair_b,window_sessions"
        ).execute()
        LOGGER.info("Upserted %s cross-pair correlations", len(rows))


def _run_candidate_scan(
    client: Client, prices: dict[int, pd.Series], instruments_by_id: dict[int, str]
) -> None:
    """Sweep every instrument combination and record the corrected result.

    Failures are stored alongside survivors on purpose: a shortlist without its
    denominator hides exactly the selection effect that makes it misleading.
    """

    by_symbol = {
        instruments_by_id[instrument_id]: series
        for instrument_id, series in prices.items()
        if instrument_id in instruments_by_id
    }
    if len(by_symbol) < 2:
        return

    candidates, summary = scan_universe(by_symbol)
    if not candidates:
        return

    today = date.today().isoformat()
    rows = [
        {
            "symbol_a": candidate.symbol_a,
            "symbol_b": candidate.symbol_b,
            "method": candidate.method,
            "sessions": candidate.sessions,
            "adf_p": _clean(candidate.adf_p),
            "half_life": _clean(candidate.half_life),
            "latest_z": _clean(candidate.latest_z),
            "survives_fdr": candidate.survives_fdr,
            "rank": candidate.rank,
            "scanned_on": today,
        }
        for candidate in candidates
    ]
    _upsert_batches(client, "candidates", rows, conflict="symbol_a,symbol_b,method")
    client.table("scan_runs").upsert(
        {
            "scanned_on": today,
            "tested": summary["tested"],
            "raw_pass": summary["raw_pass"],
            "survivors": summary["survivors"],
            "expected_false_positives": summary["expected_false_positives_uncorrected"],
            "alpha": FDR_ALPHA,
        },
        on_conflict="scanned_on",
    ).execute()


def run_daily(settings: Settings) -> None:
    client = create_supabase_client(settings)
    seed_reference_data(client)
    ingest_prices(client, settings)

    pairs = client.table("pairs").select("*").order("id").execute().data or []
    if not pairs:
        raise RuntimeError("No pairs are configured; seeding must have failed.")

    # Every ingested instrument is loaded, not just the ones inside a
    # configured pair: the scanner needs the whole universe.
    all_instruments = client.table("instruments").select("id,symbol").execute().data or []
    instruments_by_id = {int(row["id"]): str(row["symbol"]) for row in all_instruments}
    prices = load_price_series(client, sorted(instruments_by_id), start_date=settings.start_date)

    latest_by_pair: dict[int, dict[str, Any]] = {}
    frames: dict[str, pd.DataFrame] = {}
    for pair_row in pairs:
        pair_id = int(pair_row["id"])
        leg_a = prices.get(int(pair_row["leg_a"]))
        leg_b = prices.get(int(pair_row["leg_b"]))
        if leg_a is None or leg_b is None or leg_a.empty or leg_b.empty:
            LOGGER.error("Skipping %s: missing price history for a leg.", pair_row["slug"])
            continue

        stats_settings = StatisticsSettings(
            lookback=int(pair_row.get("lookback") or 60),
            roll_window=settings.roll_window,
            roll_min_periods=settings.roll_min_periods,
            percentile_window=settings.percentile_window,
            diagnostics_window=settings.diagnostics_window,
        )
        frame = compute_spread_daily(leg_a, leg_b, method=str(pair_row["method"]), settings=stats_settings)
        rows = _spread_rows(pair_id, frame)
        if not rows:
            LOGGER.error("No computable spread rows for %s.", pair_row["slug"])
            continue
        _upsert_batches(client, "spread_daily", rows, conflict="pair_id,d")
        latest_by_pair[pair_id] = rows[-1]
        LOGGER.info("Upserted %s spread rows for %s", len(rows), pair_row["slug"])

        signal_rows = build_signal_rows(
            frame,
            pair_id=pair_id,
            entry_z=float(pair_row.get("entry_z") or 2.0),
            cooldown_sessions=settings.signal_cooldown_sessions,
        )
        if signal_rows:
            # ignore_duplicates keeps the notified flag on already-known signals.
            for start in range(0, len(signal_rows), UPSERT_BATCH_SIZE):
                chunk = signal_rows[start : start + UPSERT_BATCH_SIZE]
                client.table("signals").upsert(
                    chunk, on_conflict="pair_id,d", ignore_duplicates=True
                ).execute()
        _send_signal_alerts(client, settings, pair_row, frame)

        frames[str(pair_row["slug"])] = frame
        _write_research(client, pair_id, frame, signal_rows)

        meta = pair_metadata().get(str(pair_row["slug"]))
        manage_pair(
            client,
            pair_id=pair_id,
            slug=str(pair_row["slug"]),
            display_name=meta.display_name if meta else str(pair_row["slug"]).upper(),
            entry_z=float(pair_row.get("entry_z") or 2.0),
            stop_z=float(pair_row.get("stop_z") or 3.0),
            frame=frame,
        )

    if not latest_by_pair:
        raise RuntimeError("No pair produced statistics; refusing to send an empty digest.")

    _write_correlations(client, pairs, frames)
    _run_candidate_scan(client, prices, instruments_by_id)
    _send_digest(client, settings, latest_by_pair, pairs)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    run_daily(Settings.from_env())
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
