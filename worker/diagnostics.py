"""Retrospective research on the desk's own signals.

Three questions this module answers, all of them descriptive:

1. *Has a dislocation historically closed?*  For every past signal, measure the
   spread's move over the following sessions in entry-day sigma units, signed so
   positive always means "closed in the signal's favour", plus the worst adverse
   excursion suffered along the way.
2. *Has the relationship's level shifted?*  A two-sample (Chow-style) scan for
   structural breaks, so a 60-day mean that straddles a regime change is visibly
   untrustworthy.
3. *Are these spreads really one bet?*  Rolling correlation of daily spread
   changes between pairs.

None of this predicts anything.  It reports what already happened, with the
sample size attached, so the operator can judge whether the screen is worth
acting on.  Overlapping windows mean these observations are not independent.
"""

from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np
import pandas as pd


DEFAULT_HORIZONS: tuple[int, ...] = (5, 10, 20)
CORRELATION_WINDOW = 120

# Break scan: compare adjacent windows, keep only large, well-separated shifts.
# Thresholds apply to an autocorrelation-corrected statistic (see below), and
# are deliberately strict: a "structural break" every few months would be
# volatility, not structure, and would make the warning worthless.
BREAK_WINDOW = 60
BREAK_MIN_T = 4.0
BREAK_MIN_SHIFT = 2.0
BREAK_MIN_SEPARATION = 250
BREAK_MAX_PER_PAIR = 6


@dataclass(frozen=True)
class SignalOutcome:
    """One signal's realised forward path, in entry-day sigma units."""

    d: pd.Timestamp
    direction: str
    forward: dict[int, float]
    mae: float


def _direction_sign(direction: str) -> float:
    # A short-spread signal profits when the spread falls.
    return -1.0 if direction == "short_spread" else 1.0


def signal_outcomes(
    frame: pd.DataFrame,
    signal_dates: pd.Series | list[pd.Timestamp],
    directions: dict[pd.Timestamp, str],
    *,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
) -> list[SignalOutcome]:
    """Measure what followed each signal, using only sessions after it.

    The denominator is the entry session's sigma, so outcomes are comparable
    across pairs and across time regardless of the spread's unit or level.
    """

    values = pd.to_numeric(frame["value"], errors="coerce")
    sigmas = pd.to_numeric(frame["std_60"], errors="coerce")
    index = frame.index
    position_of = {session: position for position, session in enumerate(index)}
    longest = max(horizons)

    outcomes: list[SignalOutcome] = []
    for session in signal_dates:
        stamp = pd.Timestamp(session)
        start = position_of.get(stamp)
        if start is None:
            continue
        entry_value = values.iloc[start]
        sigma = sigmas.iloc[start]
        if not np.isfinite(entry_value) or not np.isfinite(sigma) or sigma <= 0:
            continue

        sign = _direction_sign(directions.get(stamp, "long_spread"))
        # Path strictly after the signal session; a truncated tail is simply a
        # shorter path, never padded.
        path = values.iloc[start + 1 : start + 1 + longest]
        if path.empty:
            continue
        moves = sign * (path.to_numpy(dtype=float) - float(entry_value)) / float(sigma)
        moves = moves[np.isfinite(moves)]
        if moves.size == 0:
            continue

        forward: dict[int, float] = {}
        for horizon in horizons:
            if moves.size >= horizon:
                forward[horizon] = float(moves[horizon - 1])
        outcomes.append(
            SignalOutcome(
                d=stamp,
                direction=directions.get(stamp, "long_spread"),
                forward=forward,
                # Worst point of the realised path: what the operator would
                # have had to sit through.
                mae=float(np.min(moves)),
            )
        )
    return outcomes


def aggregate_outcomes(
    outcomes: list[SignalOutcome],
    *,
    horizons: tuple[int, ...] = DEFAULT_HORIZONS,
) -> list[dict[str, float | int]]:
    """Summarise outcomes per horizon; an empty sample yields no row."""

    rows: list[dict[str, float | int]] = []
    for horizon in horizons:
        sample = np.array(
            [outcome.forward[horizon] for outcome in outcomes if horizon in outcome.forward],
            dtype=float,
        )
        if sample.size == 0:
            continue
        maes = np.array(
            [outcome.mae for outcome in outcomes if horizon in outcome.forward], dtype=float
        )
        rows.append(
            {
                "horizon": horizon,
                "n": int(sample.size),
                "hit_rate": float(np.mean(sample > 0) * 100.0),
                "median_move": float(np.median(sample)),
                "p25": float(np.percentile(sample, 25)),
                "p75": float(np.percentile(sample, 75)),
                "median_mae": float(np.median(maes)),
                "worst": float(np.min(sample)),
            }
        )
    return rows


def _effective_sample_size(sample: np.ndarray) -> float:
    """Sample size adjusted for AR(1) persistence: n × (1−ρ)/(1+ρ).

    A daily spread is strongly autocorrelated, so its 60 observations carry far
    less independent information than 60 coin flips.  Ignoring that inflates
    every t-statistic enormously and would label ordinary drift a regime change.
    """

    n = sample.size
    if n < 3:
        return float(n)
    centred = sample - sample.mean()
    denominator = float(np.dot(centred, centred))
    if denominator <= 0:
        return float(n)
    rho = float(np.dot(centred[:-1], centred[1:]) / denominator)
    rho = min(max(rho, 0.0), 0.99)
    return max(float(n) * (1.0 - rho) / (1.0 + rho), 2.0)


def detect_structural_breaks(
    values: pd.Series,
    *,
    window: int = BREAK_WINDOW,
    min_t: float = BREAK_MIN_T,
    min_shift: float = BREAK_MIN_SHIFT,
    min_separation: int = BREAK_MIN_SEPARATION,
    max_breaks: int = BREAK_MAX_PER_PAIR,
) -> list[dict[str, float | pd.Timestamp]]:
    """Scan for level shifts by comparing adjacent windows (Chow-style).

    Retrospective by construction: it compares the window before a candidate
    date with the window after it, so it can only ever describe the past.  It
    never feeds the z-score, which stays strictly backward-looking.

    The standard error uses an AR(1)-corrected effective sample size, because
    the naive two-sample t-statistic on autocorrelated daily data is inflated
    several-fold and would flag a "break" every few months.
    """

    series = pd.to_numeric(values, errors="coerce").dropna()
    if len(series) < 2 * window + 1:
        return []

    array = series.to_numpy(dtype=float)
    candidates: list[tuple[int, float, float]] = []
    for position in range(window, len(array) - window):
        left = array[position - window : position]
        right = array[position : position + window]
        mean_left, mean_right = float(np.mean(left)), float(np.mean(right))
        var_left, var_right = float(np.var(left, ddof=1)), float(np.var(right, ddof=1))
        n_left = _effective_sample_size(left)
        n_right = _effective_sample_size(right)
        standard_error = math.sqrt(var_left / n_left + var_right / n_right)
        if not math.isfinite(standard_error) or standard_error <= 0:
            continue
        pooled_sigma = math.sqrt(max((var_left + var_right) / 2.0, 1e-12))
        shift = (mean_right - mean_left) / pooled_sigma
        t_stat = abs(mean_right - mean_left) / standard_error
        if t_stat >= min_t and abs(shift) >= min_shift:
            candidates.append((position, shift, t_stat))

    # Keep the strongest candidate in each cluster so one regime change is not
    # reported as dozens of adjacent breaks.
    breaks: list[dict[str, float | pd.Timestamp]] = []
    # Strongest first, so a cluster collapses to its most significant date.
    for position, shift, t_stat in sorted(candidates, key=lambda item: -abs(item[1])):
        if len(breaks) >= max_breaks:
            break
        if any(abs(position - int(existing["position"])) < min_separation for existing in breaks):
            continue
        breaks.append(
            {
                "position": position,
                "d": series.index[position],
                "shift": round(shift, 4),
                "t_stat": round(t_stat, 3),
            }
        )

    breaks.sort(key=lambda item: item["position"])
    for item in breaks:
        item.pop("position", None)
    return breaks


def correlation_matrix(
    spreads: dict[str, pd.Series],
    *,
    window: int = CORRELATION_WINDOW,
) -> list[dict[str, float | int | str]]:
    """Correlate recent daily spread changes across pairs.

    Changes rather than levels: two trending spreads can look correlated at the
    level while their day-to-day risk is unrelated.  Pairs are inner-joined on
    date, so differing market holidays never fabricate a shared session.
    """

    if len(spreads) < 2:
        return []

    changes = pd.DataFrame(
        {slug: pd.to_numeric(series, errors="coerce").diff() for slug, series in spreads.items()}
    ).tail(window * 2)

    rows: list[dict[str, float | int | str]] = []
    slugs = sorted(changes.columns)
    for i, slug_a in enumerate(slugs):
        for slug_b in slugs[i + 1 :]:
            joined = changes[[slug_a, slug_b]].dropna().tail(window)
            if len(joined) < max(30, window // 4):
                continue
            left = joined[slug_a].to_numpy(dtype=float)
            right = joined[slug_b].to_numpy(dtype=float)
            if np.std(left) <= 0 or np.std(right) <= 0:
                continue
            corr = float(np.corrcoef(left, right)[0, 1])
            if not math.isfinite(corr):
                continue
            rows.append(
                {
                    "pair_a": slug_a,
                    "pair_b": slug_b,
                    "window_sessions": window,
                    "corr": round(corr, 4),
                    "n": int(len(joined)),
                }
            )
    return rows
