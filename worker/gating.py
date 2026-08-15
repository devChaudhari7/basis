"""Walk-forward eligibility: which relationships has the bot earned the right to trade?

This is the closest thing to "learning" in BASIS, and its honesty depends
entirely on one property: **every judgement uses only information that had
already resolved at the moment it was made.**

At any date t the bot may look at signals that fired *and finished* before t.
It may not look at how the signal it is about to take turns out, nor at the
pair's full-history statistics, because those embed the future.  A rule tuned
on the complete record would produce a track record that describes the past
perfectly and predicts nothing.

The thresholds themselves are fixed constants, chosen for defensibility rather
than fitted: a pair must have produced at least ``MIN_PRIOR_SIGNALS`` resolved
signals before it can be judged at all, and having been judged, must have
closed favourably at least ``MIN_PRIOR_HIT_RATE`` of the time.  Below that
count the pair is traded anyway, on the reasoning that refusing to trade
anything unproven means never accumulating evidence.
"""

from __future__ import annotations

from dataclasses import dataclass
import math

import pandas as pd


# Thresholds are pre-committed. Changing them mid-record invalidates it, which
# is why they live here as named constants rather than as tunable inputs.
MIN_PRIOR_SIGNALS = 8
MIN_PRIOR_HIT_RATE = 30.0
OUTCOME_HORIZON = 10


@dataclass(frozen=True)
class Eligibility:
    eligible: bool
    reason: str
    prior_n: int
    prior_hit_rate: float | None


def evaluate_eligibility(
    resolved_outcomes: list[float],
    *,
    min_prior: int = MIN_PRIOR_SIGNALS,
    min_hit_rate: float = MIN_PRIOR_HIT_RATE,
) -> Eligibility:
    """Judge a pair from its already-resolved signal outcomes only.

    ``resolved_outcomes`` are forward moves in entry-day sigma, signed so
    positive means the dislocation closed.  The caller is responsible for
    passing only outcomes that had completed before the decision date.
    """

    sample = [value for value in resolved_outcomes if value is not None and math.isfinite(value)]
    count = len(sample)
    if count < min_prior:
        return Eligibility(
            eligible=True,
            reason=(
                f"unproven: only {count} resolved signal(s), below the {min_prior} needed to judge — "
                "traded so evidence can accumulate"
            ),
            prior_n=count,
            prior_hit_rate=None,
        )

    hits = sum(1 for value in sample if value > 0)
    hit_rate = 100.0 * hits / count
    if hit_rate < min_hit_rate:
        return Eligibility(
            eligible=False,
            reason=(
                f"stood down: {hit_rate:.0f}% of {count} prior signals closed favourably, "
                f"below the {min_hit_rate:.0f}% floor"
            ),
            prior_n=count,
            prior_hit_rate=hit_rate,
        )
    return Eligibility(
        eligible=True,
        reason=f"cleared: {hit_rate:.0f}% of {count} prior signals closed favourably",
        prior_n=count,
        prior_hit_rate=hit_rate,
    )


def resolved_outcomes_before(
    signals: list[dict],
    as_of: pd.Timestamp,
    *,
    horizon: int = OUTCOME_HORIZON,
    sessions_per_day: float = 1.0,
) -> list[float]:
    """Outcomes from signals whose horizon had fully elapsed before ``as_of``.

    A signal fired 3 sessions ago has not resolved at a 10-session horizon, so
    including it would leak the future into today's decision.  Calendar days
    are used as a conservative proxy for sessions: requiring more elapsed time
    than strictly necessary can only make the filter stricter, never leakier.
    """

    cutoff = as_of - pd.Timedelta(days=horizon * 1.6 / sessions_per_day)
    outcomes: list[float] = []
    for signal in signals:
        signal_date = pd.Timestamp(str(signal.get("d")))
        if signal_date > cutoff:
            continue
        value = signal.get(f"fwd_{horizon}")
        if value is None:
            continue
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(numeric):
            outcomes.append(numeric)
    return outcomes
