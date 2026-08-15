"""Reference instruments, research-ready pairs, and maintained event seeds.

Run ``python -m worker.seed`` after applying database/schema.sql.  This module
does not seed synthetic prices, signals, trades, or performance: BASIS starts
with honest empty research and trade history.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
import logging
from typing import Any, Final

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
    {"symbol": TICKERS["COPPER"], "name": "Copper", "unit": "USD/lb", "venue": "COMEX"},
    {"symbol": TICKERS["PLATINUM"], "name": "Platinum", "unit": "USD/oz", "venue": "NYMEX"},
    {"symbol": TICKERS["US10Y_NOTE"], "name": "US 10Y Treasury Note", "unit": "points", "venue": "CBOT"},
    {"symbol": TICKERS["US2Y_NOTE"], "name": "US 2Y Treasury Note", "unit": "points", "venue": "CBOT"},
    {"symbol": TICKERS["NIFTY"], "name": "NIFTY 50", "unit": "index points", "venue": "NSE"},
    {"symbol": TICKERS["BANKNIFTY"], "name": "NIFTY Bank", "unit": "index points", "venue": "NSE"},
    {"symbol": TICKERS["SPX"], "name": "S&P 500", "unit": "index points", "venue": "Index"},
    {"symbol": TICKERS["CORN"], "name": "Corn", "unit": "USc/bushel", "venue": "CBOT"},
    {"symbol": TICKERS["WHEAT"], "name": "Wheat", "unit": "USc/bushel", "venue": "CBOT"},
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
        unit="x",
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
        unit="x",
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
        unit="resid pts",
        rationale=(
            "A rolling hedge ratio separates broad US-dollar strength from rupee-specific weakness, "
            "helping distinguish global dollar moves from Indian idiosyncratic risk."
        ),
    ),
    PairSeed(
        slug="gold-copper",
        leg_a_symbol=TICKERS["GOLD"],
        leg_b_symbol=TICKERS["COPPER"],
        method="ratio",
        display_name="GOLD/COPPER",
        unit="x",
        rationale=(
            "Gold is the monetary metal and copper the industrial one, so the ratio is a direct read "
            "on fear against growth: it rises when capital seeks safety and falls when global "
            "manufacturing and construction demand accelerates. Because the two are driven by almost "
            "unrelated buyers, the ratio tracks the macro cycle rather than any shared supply story."
        ),
    ),
    PairSeed(
        slug="platinum-gold",
        leg_a_symbol=TICKERS["PLATINUM"],
        leg_b_symbol=TICKERS["GOLD"],
        method="ratio",
        display_name="PLATINUM/GOLD",
        unit="x",
        rationale=(
            "Both are precious metals, but platinum's demand is dominated by autocatalysts and "
            "industry while gold's is monetary and investment-led. The ratio isolates industrial "
            "demand from store-of-value demand, and carries a supply story of its own: platinum "
            "mining is heavily concentrated in South Africa, so power cuts and strikes move one leg "
            "and not the other."
        ),
    ),
    PairSeed(
        slug="us10y-us2y",
        leg_a_symbol=TICKERS["US10Y_NOTE"],
        leg_b_symbol=TICKERS["US2Y_NOTE"],
        method="beta",
        display_name="US 10Y vs 2Y",
        unit="resid pts",
        rationale=(
            "The classic curve trade: the long end prices growth and inflation expectations while the "
            "front end tracks policy rates, so the two diverge across a hiking or cutting cycle. A "
            "desk would weight this by DV01; the rolling hedge ratio here is an empirical proxy for "
            "that duration weighting, estimated from the data rather than from contract specifications."
        ),
    ),
    PairSeed(
        slug="nifty-spx",
        leg_a_symbol=TICKERS["NIFTY"],
        leg_b_symbol=TICKERS["SPX"],
        method="beta",
        display_name="NIFTY vs S&P 500",
        unit="resid pts",
        rationale=(
            "Indian equities carry global risk beta plus a domestic story. Regressing NIFTY on the "
            "S&P strips out the shared global factor and leaves the India-specific residual, which "
            "responds to local flows, monsoon and fiscal news, and rupee moves. Note the two markets "
            "trade in different sessions, so same-day moves are partly a timing artefact."
        ),
    ),
    PairSeed(
        slug="corn-wheat",
        leg_a_symbol=TICKERS["CORN"],
        leg_b_symbol=TICKERS["WHEAT"],
        method="ratio",
        display_name="CORN/WHEAT",
        unit="x",
        rationale=(
            "Corn and wheat compete directly in animal feed, so livestock buyers substitute between "
            "them when the ratio moves far enough to matter. They also share weather, acreage "
            "competition, fertiliser and freight costs, which is why the ratio has historically been "
            "better behaved than either outright price."
        ),
    ),
)

# The NATGAS calendar is deliberately not seeded: Yahoo's one continuous NG=F
# symbol cannot truthfully represent two named expiry contracts. Add it only
# when a contract-specific data source and two explicit legs are configured.

# Event provenance is tracked explicitly, because the desk should never imply
# more precision than it has.
#
#   'published'    — taken from an official calendar and verified.
#   'rule-derived' — generated from the release's recurring convention. These
#                    are right most weeks but shift around public holidays, so
#                    the UI labels them and they are never used in any
#                    statistic; they are context for the operator only.
#
# RBI MPC and US CPI are deliberately absent: neither follows a rule clean
# enough to derive, and inventing plausible-looking dates would be worse than
# showing none. Add them by hand from the official calendars.
CALENDAR_START: Final[date] = date(2024, 1, 1)
CALENDAR_END: Final[date] = date(2027, 6, 30)

# Verified against the Federal Reserve's published 2026 calendar.
FOMC_DATES: tuple[date, ...] = (
    date(2026, 1, 28),
    date(2026, 3, 18),
    date(2026, 4, 29),
    date(2026, 6, 17),
    date(2026, 7, 29),
    date(2026, 9, 16),
    date(2026, 10, 28),
    date(2026, 12, 9),
)

# Rate and dollar sensitive relationships.
_MACRO_PAIRS = [
    "gold-silver",
    "gold-copper",
    "platinum-gold",
    "usdinr-dxy",
    "us10y-us2y",
    "nifty-spx",
    "brent-wti",
]


def _weekday_series(start: date, end: date, weekday: int) -> list[date]:
    """Every occurrence of one weekday in a range (Mon=0 … Sun=6)."""

    first = start + timedelta(days=(weekday - start.weekday()) % 7)
    days: list[date] = []
    current = first
    while current <= end:
        days.append(current)
        current += timedelta(days=7)
    return days


def _first_fridays(start: date, end: date) -> list[date]:
    days: list[date] = []
    year, month = start.year, start.month
    while date(year, month, 1) <= end:
        first_of_month = date(year, month, 1)
        friday = first_of_month + timedelta(days=(4 - first_of_month.weekday()) % 7)
        if start <= friday <= end:
            days.append(friday)
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return days


def _build_events() -> tuple[dict[str, Any], ...]:
    rows: list[dict[str, Any]] = [
        {
            "d": day.isoformat(),
            "label": "FOMC",
            "affects": _MACRO_PAIRS,
            "source": "published",
        }
        for day in FOMC_DATES
    ]
    # EIA weekly petroleum status report: Wednesdays 10:30 ET, pushed to
    # Thursday when Monday is a public holiday.
    rows.extend(
        {
            "d": day.isoformat(),
            "label": "EIA crude inventories",
            "affects": ["brent-wti"],
            "source": "rule-derived",
        }
        for day in _weekday_series(CALENDAR_START, CALENDAR_END, weekday=2)
    )
    # US non-farm payrolls: first Friday of the month, 8:30 ET.
    rows.extend(
        {
            "d": day.isoformat(),
            "label": "US non-farm payrolls",
            "affects": _MACRO_PAIRS,
            "source": "rule-derived",
        }
        for day in _first_fridays(CALENDAR_START, CALENDAR_END)
    )
    return tuple(rows)


EVENTS: tuple[dict[str, Any], ...] = _build_events()


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
