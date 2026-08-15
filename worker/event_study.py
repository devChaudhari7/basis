"""Do scheduled events actually move these spreads?

The desk already knows when FOMC decisions, EIA inventory reports and payroll
releases land.  That makes a real question testable: is a spread's daily move
genuinely larger on event days than on ordinary ones, or does it just feel that
way because events are memorable?

The test is deliberately non-parametric.  Daily spread changes are fat-tailed
and heteroskedastic, so a t-test on their means would be measuring the wrong
thing and would overstate significance.  Instead this compares the *median
absolute move* on event days against non-event days with a Mann-Whitney U
test, which assumes nothing about the shape of the distribution.

And because one sweep tests many pair/event combinations at once, the same
Benjamini-Hochberg correction used by the candidate scanner is applied here.
Without it, testing 9 pairs against 3 event types would be 27 tests, of which
roughly 3 would look significant against pure noise.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import math

import numpy as np
import pandas as pd
from scipy.stats import mannwhitneyu

from .scanner import benjamini_hochberg


LOGGER = logging.getLogger(__name__)

MIN_EVENT_SESSIONS = 20
FDR_ALPHA = 0.10


@dataclass(frozen=True)
class EventImpact:
    pair_slug: str
    label: str
    event_sessions: int
    other_sessions: int
    median_event_move: float
    median_other_move: float
    ratio: float
    p_value: float
    survives_fdr: bool = False


def measure_event_impact(
    spread: pd.Series,
    event_dates: set[str],
    *,
    pair_slug: str,
    label: str,
) -> EventImpact | None:
    """Compare absolute daily moves on event days against every other day."""

    values = pd.to_numeric(spread, errors="coerce").dropna()
    changes = values.diff().dropna().abs()
    if changes.empty:
        return None

    index_dates = [pd.Timestamp(stamp).date().isoformat() for stamp in changes.index]
    mask = np.array([day in event_dates for day in index_dates])
    on_event = changes.to_numpy()[mask]
    off_event = changes.to_numpy()[~mask]

    if on_event.size < MIN_EVENT_SESSIONS or off_event.size < MIN_EVENT_SESSIONS:
        return None

    median_event = float(np.median(on_event))
    median_other = float(np.median(off_event))
    try:
        # One-sided: the hypothesis is that events add volatility, not remove it.
        _, p_value = mannwhitneyu(on_event, off_event, alternative="greater")
    except ValueError:
        return None
    if not math.isfinite(p_value):
        return None

    return EventImpact(
        pair_slug=pair_slug,
        label=label,
        event_sessions=int(on_event.size),
        other_sessions=int(off_event.size),
        median_event_move=median_event,
        median_other_move=median_other,
        ratio=median_event / median_other if median_other > 0 else math.nan,
        p_value=float(p_value),
    )


def run_event_study(
    spreads: dict[str, pd.Series],
    events: list[dict],
) -> tuple[list[EventImpact], dict[str, int]]:
    """Test every pair against every event type it is tagged against."""

    by_label: dict[str, dict[str, set[str]]] = {}
    for event in events:
        label = str(event.get("label", ""))
        affects = event.get("affects") or []
        for slug in affects:
            by_label.setdefault(label, {}).setdefault(slug, set()).add(str(event.get("d")))

    results: list[EventImpact] = []
    for label, per_slug in by_label.items():
        for slug, dates in per_slug.items():
            spread = spreads.get(slug)
            if spread is None or spread.empty:
                continue
            impact = measure_event_impact(spread, dates, pair_slug=slug, label=label)
            if impact is not None:
                results.append(impact)

    if not results:
        return [], {"tested": 0, "raw_pass": 0, "survivors": 0}

    survives = benjamini_hochberg([item.p_value for item in results], alpha=FDR_ALPHA)
    corrected = [
        EventImpact(**{**item.__dict__, "survives_fdr": passed})
        for item, passed in zip(results, survives)
    ]
    corrected.sort(key=lambda item: item.p_value)

    summary = {
        "tested": len(results),
        "raw_pass": sum(1 for item in results if item.p_value < FDR_ALPHA),
        "survivors": sum(survives),
        "expected_false_positives": int(round(len(results) * FDR_ALPHA)),
    }
    LOGGER.info(
        "Event study: %s pair/event combinations tested, %s significant uncorrected "
        "(~%s expected by chance), %s survive correction",
        summary["tested"],
        summary["raw_pass"],
        summary["expected_false_positives"],
        summary["survivors"],
    )
    return corrected, summary
