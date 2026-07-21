"""Compute a real, Supabase-free desk snapshot for the frontend fallback.

Run with ``python -m worker.export_snapshot``.  It downloads the same Yahoo
EOD histories the daily job uses, runs the identical statistics engine, and
writes ``lib/snapshot/desk.json``.  The frontend serves this snapshot when no
Supabase environment is configured, clearly labelled as a delayed EOD extract.

Nothing here is synthesised: every number comes from the statistics engine
over real settlement data.  Paper trades are intentionally absent — a track
record only exists once an operator logs real entries.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import math
from pathlib import Path
from typing import Any

import pandas as pd

from .config import PROJECT_ROOT, Settings
from .ingest import download_histories
from .seed import EVENTS, INSTRUMENTS, PAIRS
from .stats import StatisticsSettings, build_signal_rows, compute_spread_daily


LOGGER = logging.getLogger(__name__)
SNAPSHOT_PATH = PROJECT_ROOT / "lib" / "snapshot" / "desk.json"
SERIES_SESSIONS = 480
MAX_SIGNALS = 12


def _num(value: Any) -> float | None:
    """JSON-safe numeric: NaN/inf become null rather than crashing the dump."""

    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _series_points(frame: pd.DataFrame) -> list[dict[str, Any]]:
    trimmed = frame.tail(SERIES_SESSIONS)
    points: list[dict[str, Any]] = []
    for session, row in trimmed.iterrows():
        value = _num(row.get("value"))
        if value is None:
            continue
        points.append(
            {
                "d": pd.Timestamp(session).date().isoformat(),
                "v": value,
                "m": _num(row.get("mean_60")),
                "s": _num(row.get("std_60")),
                "z": _num(row.get("z")),
                "roll": bool(row.get("roll_suspect", False)),
            }
        )
    return points


def _latest_summary(frame: pd.DataFrame) -> dict[str, Any] | None:
    usable = frame[frame["value"].notna()]
    if usable.empty:
        return None
    latest = usable.iloc[-1]
    previous_value = _num(usable["value"].iloc[-2]) if len(usable) >= 2 else None
    return {
        "d": pd.Timestamp(usable.index[-1]).date().isoformat(),
        "value": _num(latest.get("value")),
        "prevValue": previous_value,
        "mean60": _num(latest.get("mean_60")),
        "std60": _num(latest.get("std_60")),
        "z": _num(latest.get("z")),
        "z30": _num(latest.get("z_30")),
        "z90": _num(latest.get("z_90")),
        "stability": str(latest.get("stability") or "insufficient_data"),
        "pctRank": _num(latest.get("pct_rank_252")),
        "halfLife": _num(latest.get("half_life")),
        "adfP": _num(latest.get("adf_p")),
        "beta": _num(latest.get("beta")),
        "rollSuspect": bool(latest.get("roll_suspect", False)),
    }


def build_snapshot(settings: Settings) -> dict[str, Any]:
    instrument_meta = {row["symbol"]: row for row in INSTRUMENTS}
    histories = download_histories(settings)

    pairs_payload: list[dict[str, Any]] = []
    for index, pair in enumerate(PAIRS, start=1):
        leg_a = histories.get(pair.leg_a_symbol)
        leg_b = histories.get(pair.leg_b_symbol)
        if leg_a is None or leg_b is None or leg_a.empty or leg_b.empty:
            LOGGER.error("Skipping %s: missing history for a leg.", pair.slug)
            continue

        frame = compute_spread_daily(
            leg_a["close"],
            leg_b["close"],
            method=pair.method,  # type: ignore[arg-type]
            settings=StatisticsSettings(lookback=pair.lookback),
        )
        latest = _latest_summary(frame)
        if latest is None:
            LOGGER.error("Skipping %s: no computable spread values.", pair.slug)
            continue

        signals = [
            {"d": row["d"], "z": row["z"], "direction": row["direction"]}
            for row in build_signal_rows(frame, pair_id=index, entry_z=pair.entry_z)
        ][-MAX_SIGNALS:]

        legs = [
            {
                "symbol": symbol,
                "name": instrument_meta.get(symbol, {}).get("name", symbol),
                "venue": instrument_meta.get(symbol, {}).get("venue", ""),
            }
            for symbol in (pair.leg_a_symbol, pair.leg_b_symbol)
        ]
        pairs_payload.append(
            {
                "slug": pair.slug,
                "displayName": pair.display_name,
                "method": pair.method,
                "unit": pair.unit,
                "lookback": pair.lookback,
                "entryZ": pair.entry_z,
                "stopZ": pair.stop_z,
                "rationale": pair.rationale,
                "legs": legs,
                "latest": latest,
                "series": _series_points(frame),
                "signals": signals,
            }
        )
        LOGGER.info(
            "%s: %s sessions, latest z %s (%s)",
            pair.slug,
            len(frame),
            latest["z"],
            latest["d"],
        )

    if not pairs_payload:
        raise RuntimeError("No pair produced a snapshot; refusing to write an empty file.")

    as_of = max(str(item["latest"]["d"]) for item in pairs_payload)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "asOf": as_of,
        "source": "yahoo-eod-snapshot",
        "events": [dict(event) for event in EVENTS],
        "pairs": pairs_payload,
    }


def write_snapshot(snapshot: dict[str, Any], path: Path = SNAPSHOT_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, allow_nan=False, indent=None, separators=(",", ":")), encoding="utf-8")
    return path


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = Settings.from_env(require_supabase=False)
    path = write_snapshot(build_snapshot(settings))
    LOGGER.info("Snapshot written to %s", path)
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
