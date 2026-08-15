"""Does a learned model beat the fixed rule? Settled by walk-forward experiment.

The desk's position has been that ~200 overlapping signals is too small a
sample to learn from.  That is a claim, and claims should be tested rather than
asserted, so this module runs the experiment properly and reports whatever it
finds.

The protocol is the part that matters:

* **Features are known at decision time.**  Every input comes from the signal
  session or earlier — z, window dispersion, ADF p-value, half-life, percentile
  rank, break proximity.  Nothing describes the outcome being predicted.
* **Training is strictly historical.**  For each signal, the model is refitted
  on only those signals whose outcomes had already resolved before that
  signal's date.  A model fitted once on the whole history and evaluated on the
  same history would report a fantastic score that means nothing.
* **The baseline is the fixed rule.**  "Take every signal" is what the bot does
  today, so that is what a model must beat to justify replacing it.
* **Chance is measured, not assumed.**  A permutation test reshuffles the
  labels many times to establish what an edge of this size looks like when
  there is, by construction, no edge at all.

A model that wins here has earned its place.  One that does not has told you
something more useful than a backtest ever could.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import math

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


LOGGER = logging.getLogger(__name__)

# With a sample this small, a high-capacity model would memorise it. Strong L2
# regularisation on a linear model is the defensible choice.
MIN_TRAIN = 40
REGULARISATION_C = 0.25
DECISION_THRESHOLD = 0.5
PERMUTATIONS = 500
RANDOM_SEED = 7

FEATURES = (
    "abs_z",
    "window_dispersion",
    "adf_p",
    "half_life",
    "pct_rank_extremity",
    "sigma_ratio",
)


@dataclass(frozen=True)
class ExperimentResult:
    n_evaluated: int
    rule_hit_rate: float
    model_hit_rate: float
    model_taken: int
    rule_expectancy: float
    model_expectancy: float
    permutation_p: float
    verdict: str


def build_features(signal_row: dict, daily_row: dict) -> dict[str, float] | None:
    """Assemble one signal's inputs, all observable on the signal session."""

    def number(value: object) -> float:
        try:
            result = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return math.nan
        return result if math.isfinite(result) else math.nan

    z = number(daily_row.get("z"))
    z30 = number(daily_row.get("z_30"))
    z90 = number(daily_row.get("z_90"))
    adf_p = number(daily_row.get("adf_p"))
    half_life = number(daily_row.get("half_life"))
    pct_rank = number(daily_row.get("pct_rank_252"))
    std_60 = number(daily_row.get("std_60"))
    value = number(daily_row.get("value"))

    if not math.isfinite(z) or not math.isfinite(adf_p):
        return None

    windows = [w for w in (z30, z, z90) if math.isfinite(w)]
    dispersion = (max(windows) - min(windows)) if len(windows) == 3 else math.nan

    return {
        "abs_z": abs(z),
        "window_dispersion": dispersion if math.isfinite(dispersion) else 0.5,
        "adf_p": adf_p,
        # No detectable reversion is encoded as the worst case, not dropped.
        "half_life": half_life if math.isfinite(half_life) and half_life > 0 else 60.0,
        "pct_rank_extremity": abs(pct_rank - 50.0) if math.isfinite(pct_rank) else 25.0,
        "sigma_ratio": (std_60 / abs(value)) if math.isfinite(std_60) and abs(value) > 1e-9 else 0.0,
    }


def _fit_predict(
    train_x: np.ndarray, train_y: np.ndarray, test_x: np.ndarray
) -> float:
    """Fit on history only and return P(favourable) for one held-out signal."""

    if len(np.unique(train_y)) < 2:
        # Degenerate history: fall back to the base rate, i.e. take the trade.
        return float(train_y.mean()) if train_y.size else 0.5
    scaler = StandardScaler().fit(train_x)
    model = LogisticRegression(C=REGULARISATION_C, max_iter=2000, solver="lbfgs")
    model.fit(scaler.transform(train_x), train_y)
    return float(model.predict_proba(scaler.transform(test_x))[0, 1])


def walk_forward_experiment(samples: pd.DataFrame) -> ExperimentResult | None:
    """Refit before every decision; score only genuinely out-of-sample calls.

    ``samples`` needs columns: d (date), outcome (signed forward move), plus
    every name in FEATURES.
    """

    frame = samples.dropna(subset=["outcome", *FEATURES]).sort_values("d").reset_index(drop=True)
    if len(frame) < MIN_TRAIN + 20:
        LOGGER.warning("Only %s usable signals; too few to run the experiment.", len(frame))
        return None

    x_all = frame[list(FEATURES)].to_numpy(dtype=float)
    outcomes = frame["outcome"].to_numpy(dtype=float)
    labels = (outcomes > 0).astype(int)
    dates = pd.to_datetime(frame["d"])

    probabilities: list[float] = []
    evaluated: list[int] = []
    for position in range(MIN_TRAIN, len(frame)):
        # Only signals that had already RESOLVED before this one may train it.
        resolved_before = dates < (dates.iloc[position] - pd.Timedelta(days=16))
        train_index = np.flatnonzero(resolved_before.to_numpy()[:position])
        if train_index.size < MIN_TRAIN:
            continue
        probability = _fit_predict(
            x_all[train_index], labels[train_index], x_all[position : position + 1]
        )
        probabilities.append(probability)
        evaluated.append(position)

    if len(evaluated) < 20:
        LOGGER.warning("Only %s out-of-sample decisions; inconclusive.", len(evaluated))
        return None

    index = np.array(evaluated)
    probability_array = np.array(probabilities)
    taken = probability_array >= DECISION_THRESHOLD
    evaluated_outcomes = outcomes[index]
    evaluated_labels = labels[index]

    rule_hit = float(evaluated_labels.mean() * 100)
    model_hit = float(evaluated_labels[taken].mean() * 100) if taken.any() else math.nan
    rule_expectancy = float(evaluated_outcomes.mean())
    model_expectancy = float(evaluated_outcomes[taken].mean()) if taken.any() else math.nan

    # What would an edge this size look like with no edge at all?
    rng = np.random.default_rng(RANDOM_SEED)
    observed_gap = (model_expectancy - rule_expectancy) if taken.any() else -math.inf
    better_by_chance = 0
    for _ in range(PERMUTATIONS):
        shuffled = rng.permutation(taken)
        if not shuffled.any():
            continue
        gap = float(evaluated_outcomes[shuffled].mean()) - rule_expectancy
        if gap >= observed_gap:
            better_by_chance += 1
    permutation_p = (better_by_chance + 1) / (PERMUTATIONS + 1)

    beats = (
        taken.any()
        and math.isfinite(model_expectancy)
        and model_expectancy > rule_expectancy
        and permutation_p < 0.05
    )
    verdict = (
        "model beats the fixed rule out-of-sample"
        if beats
        else "no out-of-sample improvement over the fixed rule"
    )

    return ExperimentResult(
        n_evaluated=len(evaluated),
        rule_hit_rate=rule_hit,
        model_hit_rate=model_hit,
        model_taken=int(taken.sum()),
        rule_expectancy=rule_expectancy,
        model_expectancy=model_expectancy,
        permutation_p=permutation_p,
        verdict=verdict,
    )
