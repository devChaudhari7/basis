"""The mechanical paper trader.

Every rule here is fixed in advance and applied identically to every pair.
Nothing in this module is fitted, optimised, or learned from past results — if
it were, the resulting track record would be an in-sample illusion rather than
the out-of-sample evidence that makes it worth keeping at all.

The rules, in full:

    entry   a signal fires (|z| >= entry_z, spread stationary, session clean)
            and no mechanical position is already open on that pair
    target  |z| <= 0.5          the dislocation has closed
    stop    |z| >= stop_z       it stretched further instead
    time    2x the half-life estimated at entry, bounded to [5, 40] sessions;
            if no half-life was estimable, the bound's upper limit is used

Risk is fixed at entry exactly as it is for a hand-logged trade:
``(stop_z - |entry_z|) * sigma_60``, so R-multiples are directly comparable
between the machine and the operator.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
import logging
import math
from typing import Any

import pandas as pd
from supabase import Client


LOGGER = logging.getLogger(__name__)

TARGET_Z = 0.5
MIN_TIME_STOP_SESSIONS = 5
MAX_TIME_STOP_SESSIONS = 40
HALF_LIFE_MULTIPLE = 2.0


@dataclass(frozen=True)
class ExitDecision:
    reason: str
    rule: str


def time_stop_sessions(half_life: float | None) -> int:
    """Sessions to hold before a time stop, from the entry-day half-life."""

    if half_life is None or not math.isfinite(half_life) or half_life <= 0:
        # No mean reversion was detectable, so give the thesis the least rope.
        return MAX_TIME_STOP_SESSIONS
    sessions = int(round(HALF_LIFE_MULTIPLE * half_life))
    return max(MIN_TIME_STOP_SESSIONS, min(MAX_TIME_STOP_SESSIONS, sessions))


def evaluate_exit(
    *,
    direction: str,
    entry_z: float,
    current_z: float | None,
    stop_z: float,
    sessions_held: int,
    time_stop: int,
) -> ExitDecision | None:
    """Apply the exit rules in priority order: stop, target, then time."""

    if current_z is not None and math.isfinite(current_z):
        # Stop first: a stretch beyond stop_z is checked before any target so a
        # session that breaches both is never recorded as a win.
        if abs(current_z) >= stop_z:
            stretched_further = (
                (direction == "short_spread" and current_z >= stop_z)
                or (direction == "long_spread" and current_z <= -stop_z)
            )
            if stretched_further:
                return ExitDecision("stop", f"|z| reached {current_z:+.2f}, beyond the {stop_z:.1f} stop")
        if abs(current_z) <= TARGET_Z:
            return ExitDecision("target", f"z returned to {current_z:+.2f}, inside the {TARGET_Z} target band")

    if sessions_held >= time_stop:
        return ExitDecision(
            "time", f"held {sessions_held} sessions, past the {time_stop}-session time stop"
        )
    return None


def _as_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _sessions_between(frame: pd.DataFrame, opened_on: str, latest: str) -> int:
    """Count trading sessions the position has actually been open."""

    index = frame.index
    opened = pd.Timestamp(opened_on)
    current = pd.Timestamp(latest)
    return int(((index > opened) & (index <= current)).sum())


def manage_pair(
    client: Client,
    *,
    pair_id: int,
    slug: str,
    display_name: str,
    entry_z: float,
    stop_z: float,
    frame: pd.DataFrame,
) -> None:
    """Open or close the one mechanical position allowed on this pair."""

    if frame.empty:
        return
    usable = frame[frame["value"].notna()]
    if usable.empty:
        return

    latest_session = pd.Timestamp(usable.index[-1]).date()
    latest = usable.iloc[-1]
    latest_value = _as_float(latest.get("value"))
    latest_z = _as_float(latest.get("z"))
    if latest_value is None:
        return

    open_rows = (
        client.table("paper_trades")
        .select("*")
        .eq("pair_id", pair_id)
        .eq("source", "auto")
        .is_("closed_on", "null")
        .execute()
        .data
        or []
    )

    if open_rows:
        _maybe_close(
            client,
            trade=open_rows[0],
            frame=usable,
            latest_session=latest_session,
            latest_value=latest_value,
            latest_z=latest_z,
            display_name=display_name,
        )
        return

    _maybe_open(
        client,
        pair_id=pair_id,
        slug=slug,
        display_name=display_name,
        entry_z=entry_z,
        stop_z=stop_z,
        latest=latest,
        latest_session=latest_session,
        latest_value=latest_value,
        latest_z=latest_z,
    )


def _maybe_open(
    client: Client,
    *,
    pair_id: int,
    slug: str,
    display_name: str,
    entry_z: float,
    stop_z: float,
    latest: pd.Series,
    latest_session: date,
    latest_value: float,
    latest_z: float | None,
) -> None:
    """Open a position only when today's session is itself a fresh signal."""

    signal = (
        client.table("signals")
        .select("d,z,direction")
        .eq("pair_id", pair_id)
        .eq("d", latest_session.isoformat())
        .limit(1)
        .execute()
        .data
        or []
    )
    if not signal or latest_z is None:
        return
    if bool(latest.get("roll_suspect", False)):
        return

    sigma = _as_float(latest.get("std_60"))
    if sigma is None or sigma <= 0:
        return
    if stop_z <= abs(latest_z):
        LOGGER.info("Auto-trade skipped for %s: entry z already beyond the stop.", slug)
        return

    half_life = _as_float(latest.get("half_life"))
    hold = time_stop_sessions(half_life)
    direction = str(signal[0]["direction"])
    half_life_text = f"{half_life:.1f}-session half-life" if half_life else "no detectable half-life"

    client.table("paper_trades").insert(
        {
            "pair_id": pair_id,
            "opened_on": latest_session.isoformat(),
            "entry_value": latest_value,
            "entry_z": latest_z,
            "direction": direction,
            "stop_z": stop_z,
            "source": "auto",
            "rule": f"entry |z|>={entry_z:.1f}; target |z|<={TARGET_Z}; stop |z|>={stop_z:.1f}; time {hold} sessions",
            "hypothesis": (
                f"Mechanical rule, no discretion: {display_name} reached {latest_z:+.2f} sigma with a "
                f"stationary spread and a clean session, so the pre-committed rule expects the "
                f"dislocation to close ({half_life_text}, {hold}-session time stop)."
            ),
        }
    ).execute()
    LOGGER.info(
        "Auto-trade opened on %s: %s at z=%+.2f, time stop %s sessions",
        slug,
        direction,
        latest_z,
        hold,
    )


def _maybe_close(
    client: Client,
    *,
    trade: dict[str, Any],
    frame: pd.DataFrame,
    latest_session: date,
    latest_value: float,
    latest_z: float | None,
    display_name: str,
) -> None:
    entry_value = _as_float(trade.get("entry_value"))
    entry_z = _as_float(trade.get("entry_z"))
    stop_z = _as_float(trade.get("stop_z"))
    if entry_value is None or entry_z is None or stop_z is None:
        return

    opened_on = str(trade["opened_on"])
    sessions_held = _sessions_between(frame, opened_on, latest_session.isoformat())

    entry_rows = frame[frame.index <= pd.Timestamp(opened_on)]
    half_life = _as_float(entry_rows.iloc[-1].get("half_life")) if not entry_rows.empty else None
    sigma_at_entry = _as_float(entry_rows.iloc[-1].get("std_60")) if not entry_rows.empty else None

    decision = evaluate_exit(
        direction=str(trade["direction"]),
        entry_z=entry_z,
        current_z=latest_z,
        stop_z=stop_z,
        sessions_held=sessions_held,
        time_stop=time_stop_sessions(half_life),
    )
    if decision is None:
        return

    sign = -1.0 if str(trade["direction"]) == "short_spread" else 1.0
    pnl_points = sign * (latest_value - entry_value)
    risk = (stop_z - abs(entry_z)) * sigma_at_entry if sigma_at_entry else None
    r_multiple = pnl_points / risk if risk and risk > 0 else None

    client.table("paper_trades").update(
        {
            "closed_on": latest_session.isoformat(),
            "exit_value": latest_value,
            "exit_z": latest_z,
            "exit_reason": decision.reason,
            "pnl_points": pnl_points,
            "r_multiple": r_multiple,
            "rule": decision.rule,
            "post_mortem": (
                f"Closed mechanically after {sessions_held} sessions: {decision.rule}. "
                "No discretion was applied at any point."
            ),
        }
    ).eq("id", int(trade["id"])).execute()
    LOGGER.info(
        "Auto-trade closed on %s: %s after %s sessions (%s)",
        display_name,
        decision.reason,
        sessions_held,
        f"{r_multiple:+.2f}R" if r_multiple is not None else "R n/a",
    )
