"""Automated candidate research across the whole instrument universe.

The desk ingests N instruments, so there are N(N-1)/2 possible pairs.  Testing
every one of them for stationarity and keeping whatever passes is the single
most common way statistical arbitrage research fools itself, because the
p-value's guarantee is *per test*.  Run 120 independent tests at the 10% level
against pure noise and roughly 12 will pass; run 5,000 and roughly 500 will.
Every one of those is a spread that looks beautifully mean-reverting, has a
plausible-sounding story attached after the fact, and reverts to nothing.

So this scanner does three things beyond testing:

1. **Corrects for multiple comparisons** with Benjamini-Hochberg, controlling
   the false discovery rate across the whole sweep rather than per pair.
2. **Publishes the denominator** — how many combinations were examined — so the
   selection is visible instead of hidden.
3. **Refuses to promote anything on statistics alone.**  A candidate becomes a
   monitored pair only when a human writes down why the relationship should
   exist economically.  That gate is the point: statistics can rank candidates,
   but only a reason can justify one.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
import logging
import math

import numpy as np
import pandas as pd

from .stats import adf_pvalue, estimate_half_life


LOGGER = logging.getLogger(__name__)

FDR_ALPHA = 0.10
MIN_OVERLAP_SESSIONS = 400
MIN_HALF_LIFE = 2.0
MAX_HALF_LIFE = 60.0


@dataclass(frozen=True)
class Candidate:
    symbol_a: str
    symbol_b: str
    method: str
    sessions: int
    adf_p: float
    half_life: float
    latest_z: float
    survives_fdr: bool = False
    rank: int = 0


def benjamini_hochberg(p_values: list[float], alpha: float = FDR_ALPHA) -> list[bool]:
    """Which hypotheses survive at a false-discovery rate of ``alpha``.

    Sorting the p-values ascending, the largest k where p(k) <= k/m * alpha
    determines the cutoff; everything at or below it is kept.  This is far less
    brutal than Bonferroni while still controlling the proportion of the
    survivors that are expected to be false.
    """

    m = len(p_values)
    if m == 0:
        return []
    order = sorted(range(m), key=lambda index: p_values[index])
    cutoff_rank = 0
    for position, index in enumerate(order, start=1):
        if p_values[index] <= (position / m) * alpha:
            cutoff_rank = position
    survives = [False] * m
    for position, index in enumerate(order, start=1):
        if position <= cutoff_rank:
            survives[index] = True
    return survives


def _spread(a: pd.Series, b: pd.Series, method: str) -> pd.Series:
    joined = pd.concat({"a": a, "b": b}, axis=1, join="inner").dropna()
    if joined.empty:
        return pd.Series(dtype=float)
    if method == "diff":
        return joined["a"] - joined["b"]
    denominator = joined["b"].replace(0, np.nan)
    return (joined["a"] / denominator).replace([np.inf, -np.inf], np.nan).dropna()


def _latest_z(series: pd.Series, lookback: int = 60) -> float:
    if len(series) < lookback + 1:
        return math.nan
    history = series.iloc[-(lookback + 1) : -1]
    sd = float(history.std(ddof=1))
    if not math.isfinite(sd) or sd <= 0:
        return math.nan
    return float((series.iloc[-1] - history.mean()) / sd)


def scan_universe(
    prices: dict[str, pd.Series],
    *,
    methods: tuple[str, ...] = ("ratio", "diff"),
    alpha: float = FDR_ALPHA,
) -> tuple[list[Candidate], dict[str, int]]:
    """Test every combination, then correct for having tested every combination."""

    symbols = sorted(prices)
    tested: list[Candidate] = []

    for symbol_a, symbol_b in combinations(symbols, 2):
        for method in methods:
            series = _spread(prices[symbol_a], prices[symbol_b], method)
            if len(series) < MIN_OVERLAP_SESSIONS:
                continue
            p_value = adf_pvalue(series.to_numpy())
            if not math.isfinite(p_value):
                continue
            half_life = estimate_half_life(series.to_numpy())
            tested.append(
                Candidate(
                    symbol_a=symbol_a,
                    symbol_b=symbol_b,
                    method=method,
                    sessions=len(series),
                    adf_p=p_value,
                    half_life=half_life,
                    latest_z=_latest_z(series),
                )
            )

    if not tested:
        return [], {"tested": 0, "raw_pass": 0, "survivors": 0}

    survives = benjamini_hochberg([item.adf_p for item in tested], alpha=alpha)
    raw_pass = sum(1 for item in tested if item.adf_p < alpha)

    scored = [
        Candidate(**{**candidate.__dict__, "survives_fdr": passed})
        for candidate, passed in zip(tested, survives)
    ]
    # Rank survivors by how usable the reversion is, not by p-value alone: a
    # spread with a 200-session half-life is stationary and untradeable.
    scored.sort(key=lambda item: (not item.survives_fdr, item.adf_p))
    ranked = [
        Candidate(**{**candidate.__dict__, "rank": index + 1})
        for index, candidate in enumerate(scored)
    ]

    summary = {
        "tested": len(tested),
        "raw_pass": raw_pass,
        "survivors": sum(survives),
        "expected_false_positives_uncorrected": int(round(len(tested) * alpha)),
    }
    LOGGER.info(
        "Scanned %s combinations: %s passed ADF at %.0f%% uncorrected (~%s expected by chance), "
        "%s survive Benjamini-Hochberg",
        summary["tested"],
        summary["raw_pass"],
        alpha * 100,
        summary["expected_false_positives_uncorrected"],
        summary["survivors"],
    )
    return ranked, summary


def tradeable_shortlist(candidates: list[Candidate]) -> list[Candidate]:
    """Survivors whose reversion is fast enough to act on within a horizon."""

    return [
        candidate
        for candidate in candidates
        if candidate.survives_fdr
        and math.isfinite(candidate.half_life)
        and MIN_HALF_LIFE <= candidate.half_life <= MAX_HALF_LIFE
    ]
