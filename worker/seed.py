"""Reference instruments, research-ready pairs, and maintained event seeds.

Run ``python -m worker.seed`` after applying database/schema.sql.  This module
does not seed synthetic prices, signals, trades, or performance: BASIS starts
with honest empty research and trade history.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import logging
from typing import Any

from supabase import Client

from .config import Settings, TICKERS
from .ingest import create_supabase_client


LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class PairSeed:
    slug: str
    leg_a_symbol: str
    leg_b_symbol: str
    method: str
    rationale: str
    display_name: str
    unit: str
    lookback: int = 60
    entry_z: float = 2.0
    stop_z: float = 3.0


INSTRUMENTS: tuple[dict[str, str], ...] = (
    {"symbol": TICKERS["WTI"], "name": "WTI Crude", "unit": "USD/bbl", "venue": "NYMEX"},
    {"symbol": TICKERS["BRENT"], "name": "Brent Crude", "unit": "USD/bbl", "venue": "ICE"},
    {"symbol": TICKERS["NATGAS"], "name": "Henry Hub Natural Gas", "unit": "USD/MMBtu", "venue": "NYMEX"},
    {"symbol": TICKERS["GOLD"], "name": "Gold", "unit": "USD/oz", "venue": "COMEX"},
    {"symbol": TICKERS["SILVER"], "name": "Silver", "unit": "USD/oz", "venue": "COMEX"},
    {"symbol": TICKERS["US10Y_NOTE"], "name": "US 10Y Treasury Note", "unit": "points", "venue": "CBOT"},
    {"symbol": TICKERS["NIFTY"], "name": "NIFTY 50", "unit": "index points", "venue": "NSE"},
    {"symbol": TICKERS["BANKNIFTY"], "name": "NIFTY Bank", "unit": "index points", "venue": "NSE"},
    {"symbol": TICKERS["USDINR"], "name": "USD/INR", "unit": "INR per USD", "venue": "FX"},
    {"symbol": TICKERS["DXY"], "name": "US Dollar Index", "unit": "index points", "venue": "ICE"},
)


PAIRS: tuple[PairSeed, ...] = (
    PairSeed(
        slug="brent-wti",
        leg_a_symbol=TICKERS["BRENT"],
        leg_b_symbol=TICKERS["WTI"],
        method="diff",
        display_name="BRENT-WTI",
        unit="USD/bbl",
        rationale=(
            "Brent is seaborne while WTI is landlocked at Cushing; transport costs, crude quality "
            "(sulfur/API), and regional supply shocks drive the difference."
        ),
    ),
    PairSeed(
        slug="gold-silver",
        leg_a_symbol=TICKERS["GOLD"],
        leg_b_symbol=TICKERS["SILVER"],
        method="ratio",
        display_name="GOLD/SILVER",
        unit="ratio",
        rationale=(
            "The gold/silver ratio is a classic precious-metals risk gauge; silver's larger "
            "industrial demand gives it higher beta than gold during growth and risk cycles."
        ),
    ),
    PairSeed(
        slug="nifty-banknifty",
        leg_a_symbol=TICKERS["NIFTY"],
        leg_b_symbol=TICKERS["BANKNIFTY"],
        method="ratio",
        display_name="NIFTY/BANKNIFTY",
        unit="ratio",
        rationale=(
            "Financials' weight against the broad Indian market changes with credit and rate "
            "cycles, creating a useful lens on banking-sector divergence."
        ),
    ),
    PairSeed(
        slug="usdinr-dxy",
        leg_a_symbol=TICKERS["USDINR"],
        leg_b_symbol=TICKERS["DXY"],
        method="beta",
        display_name="USDINR vs DXY",
        unit="beta-adjusted points",
        rationale=(
            "A rolling hedge ratio separates broad US-dollar strength from rupee-specific weakness, "
            "helping distinguish global dollar moves from Indian idiosyncratic risk."
        ),
    ),
)

# The NATGAS calendar is deliberately not seeded: Yahoo's one continuous NG=F
# symbol cannot truthfully represent two named expiry contracts. Add it only
# when a contract-specific data source and two explicit legs are configured.

# Event dates are maintained data, not inferred from a recurring weekday rule.
# These 2026 FOMC decision dates were verified against the Federal Reserve
# calendar. Add EIA, RBI MPC, CPI, and NFP rows from their official calendars
# during the weekly desk review rather than silently inventing holiday-shifted
# dates. The events table supports that manual maintenance by design.
EVENTS: tuple[dict[str, Any], ...] = tuple(
    {
        "d": day.isoformat(),
        "label": "FOMC",
        "affects": ["brent-wti", "gold-silver", "usdinr-dxy"],
    }
    for day in (
        date(2026, 1, 28),
        date(2026, 3, 18),
        date(2026, 4, 29),
        date(2026, 6, 17),
        date(2026, 7, 29),
        date(2026, 9, 16),
        date(2026, 10, 28),
        date(2026, 12, 9),
    )
)


def pair_metadata() -> dict[str, PairSeed]:
    """Provide labels/units to notifications without duplicating them in code."""

    return {pair.slug: pair for pair in PAIRS}


def seed_reference_data(client: Client) -> dict[str, int]:
    """Upsert reference data; safe to run before every scheduled worker job."""

    client.table("instruments").upsert(list(INSTRUMENTS), on_conflict="symbol").execute()
    instruments_response = client.table("instruments").select("id,symbol").execute()
    ids = {str(row["symbol"]): int(row["id"]) for row in (instruments_response.data or [])}

    missing = sorted(
        {
            symbol
            for pair in PAIRS
            for symbol in (pair.leg_a_symbol, pair.leg_b_symbol)
            if symbol not in ids
        }
    )
    if missing:
        raise RuntimeError("Instrument seed lookup failed for: " + ", ".join(missing))

    pair_rows = [
        {
            "slug": pair.slug,
            "leg_a": ids[pair.leg_a_symbol],
            "leg_b": ids[pair.leg_b_symbol],
            "method": pair.method,
            "lookback": pair.lookback,
            "entry_z": pair.entry_z,
            "stop_z": pair.stop_z,
            "rationale": pair.rationale,
        }
        for pair in PAIRS
    ]
    client.table("pairs").upsert(pair_rows, on_conflict="slug").execute()
    client.table("events").upsert(list(EVENTS), on_conflict="d,label").execute()
    LOGGER.info("Seeded %s instruments, %s pairs, and %s event rows", len(INSTRUMENTS), len(PAIRS), len(EVENTS))
    return {"instruments": len(INSTRUMENTS), "pairs": len(PAIRS), "events": len(EVENTS)}


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = Settings.from_env()
    seed_reference_data(create_supabase_client(settings))
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
