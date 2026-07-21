"""No-lookahead spread statistics used by the BASIS research desk.

Every statistic recorded for session *t* is calculated before adding session
*t* to its estimation history.  The only current-session input is the spread
value being evaluated.  This prevents the common back-test mistake of letting
today's close dilute its own z-score.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
import math
from typing import Literal

import numpy as np
import pandas as pd
from scipy.stats import percentileofscore
import statsmodels.api as sm
from statsmodels.tsa.stattools import adfuller


SpreadMethod = Literal["diff", "ratio", "beta"]
STABILITY_WINDOWS: tuple[int, int, int] = (30, 60, 90)
STABILITY_MAX_Z_DISPERSION = 0.75


@dataclass(frozen=True)
class StatisticsSettings:
    """Settings that make the worker's statistical assumptions explicit."""

    lookback: int = 60
    beta_window: int = 60
    roll_window: int = 60
    roll_min_periods: int = 20
    percentile_window: int = 252
    diagnostics_window: int = 252
    stability_max_z_dispersion: float = STABILITY_MAX_Z_DISPERSION


def _numeric_series(series: pd.Series) -> pd.Series:
    """Return a sorted float series with duplicate dates resolved to the last row."""

    result = pd.to_numeric(series, errors="coerce").astype(float)
    result = result[~result.index.duplicated(keep="last")].sort_index()
    return result.replace([np.inf, -np.inf], np.nan)


def rolling_beta(a: pd.Series, b: pd.Series, beta_window: int = 60) -> pd.Series:
    """Calculate the rolling OLS hedge ratio specified for beta-adjusted spreads."""

    a, b = _numeric_series(a).align(_numeric_series(b), join="inner")
    variance = b.rolling(beta_window, min_periods=beta_window).var()
    beta = a.rolling(beta_window, min_periods=beta_window).cov(b) / variance
    return beta.replace([np.inf, -np.inf], np.nan)


def spread_series(a: pd.Series, b: pd.Series, method: SpreadMethod, beta_window: int = 60) -> pd.Series:
    """Build a difference, ratio, or rolling-beta-adjusted spread series.

    The formula intentionally mirrors BASIS_BUILD_SPEC.md.  The caller stores
    the beta separately when ``method == 'beta'`` so it can be shown in the UI.
    """

    a, b = _numeric_series(a).align(_numeric_series(b), join="inner")
    if method == "diff":
        return a - b
    if method == "ratio":
        return (a / b.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan)
    if method == "beta":
        beta = rolling_beta(a, b, beta_window=beta_window)
        return a - beta * b
    raise ValueError(f"Unsupported spread method: {method!r}")


def detect_roll_suspects(
    spread: pd.Series,
    *,
    window: int = 60,
    min_periods: int = 20,
    threshold: float = 4.0,
) -> pd.Series:
    """Flag unusually large one-session spread jumps without looking forward.

    Continuous futures rolls appear as jumps in the *change* of a spread, so
    the comparison uses the standard deviation of prior daily changes rather
    than the level.  At date t, the reference volatility ends at t-1.
    """

    values = _numeric_series(spread)
    changes = values.diff()
    prior_change_sigma = changes.rolling(window, min_periods=min_periods).std(ddof=1).shift(1)
    suspect = (changes.abs() > threshold * prior_change_sigma) & (prior_change_sigma > 0)
    return suspect.fillna(False).astype(bool)


def estimate_half_life(values: Iterable[float], *, min_observations: int = 20) -> float:
    """Estimate OU half-life from Δy_t = α + λy_(t-1) + ε_t.

    A non-negative lambda means this sample did not exhibit mean reversion;
    returning NaN lets the UI render "no mean reversion detected" honestly.
    """

    series = pd.Series(list(values), dtype="float64").replace([np.inf, -np.inf], np.nan).dropna()
    if len(series) < min_observations or series.nunique() < 2:
        return math.nan

    lagged = series.shift(1).iloc[1:]
    delta = series.diff().iloc[1:]
    if len(delta) < min_observations - 1:
        return math.nan

    try:
        fitted = sm.OLS(delta.to_numpy(), sm.add_constant(lagged.to_numpy())).fit()
        lam = float(fitted.params[1])
    except (ValueError, np.linalg.LinAlgError, IndexError):
        return math.nan

    if not math.isfinite(lam) or lam >= 0:
        return math.nan
    half_life = -math.log(2) / lam
    return half_life if math.isfinite(half_life) and half_life > 0 else math.nan


def adf_pvalue(values: Iterable[float], *, min_observations: int = 40) -> float:
    """Return an ADF p-value, or NaN if the sample cannot support the test."""

    series = pd.Series(list(values), dtype="float64").replace([np.inf, -np.inf], np.nan).dropna()
    if len(series) < min_observations or series.nunique() < 2:
        return math.nan
    try:
        # AIC autolag is the statsmodels default and avoids an invented fixed lag.
        return float(adfuller(series.to_numpy(), autolag="AIC")[1])
    except (ValueError, np.linalg.LinAlgError, OverflowError):
        return math.nan


def _mean_std(history: list[float], window: int) -> tuple[float, float]:
    """Return sample mean/std from the last clean observations before today."""

    if len(history) < window:
        return math.nan, math.nan
    sample = np.asarray(history[-window:], dtype=float)
    std = float(np.std(sample, ddof=1))
    if not math.isfinite(std) or std <= 0:
        return float(np.mean(sample)), math.nan
    return float(np.mean(sample)), std


def _z_from_history(value: float, history: list[float], window: int) -> tuple[float, float, float]:
    mean, std = _mean_std(history, window)
    if not math.isfinite(value) or not math.isfinite(std):
        return math.nan, mean, std
    return (value - mean) / std, mean, std


def _percentile_rank(value: float, history: list[float], window: int) -> float:
    """Rank today's clean value within a trailing 252-session population."""

    # Today's value belongs in its own percentile population; unlike mean/std,
    # the definition is specifically the rank of today's value in the window.
    if len(history) < window - 1:
        return math.nan
    sample = np.asarray(history[-(window - 1) :] + [value], dtype=float)
    return float(percentileofscore(sample, value, kind="rank"))


def _stability_label(z_values: tuple[float, float, float], max_dispersion: float) -> str:
    finite = [value for value in z_values if math.isfinite(value)]
    if len(finite) != len(z_values):
        return "insufficient_data"
    return "stable" if max(finite) - min(finite) <= max_dispersion else "unstable"


def compute_spread_daily(
    a: pd.Series,
    b: pd.Series,
    *,
    method: SpreadMethod,
    settings: StatisticsSettings | None = None,
) -> pd.DataFrame:
    """Compute all persistence-ready daily statistics for one pair.

    Prices are inner-joined and never forward-filled.  Suspected roll sessions
    remain in the returned frame for chart markers, but are never admitted to
    the clean history used for z-scores, percentile ranks, ADF, or half-life.
    """

    config = settings or StatisticsSettings()
    if config.lookback < 2:
        raise ValueError("lookback must be at least 2 sessions.")
    if config.percentile_window < 2:
        raise ValueError("percentile_window must be at least 2 sessions.")

    aligned = pd.concat(
        {"leg_a": _numeric_series(a), "leg_b": _numeric_series(b)}, axis=1, join="inner"
    ).dropna(how="any")
    if aligned.empty:
        return pd.DataFrame(
            columns=[
                "value",
                "mean_60",
                "std_60",
                "z",
                "pct_rank_252",
                "half_life",
                "beta",
                "roll_suspect",
                "adf_p",
                "z_30",
                "z_90",
                "stability",
            ]
        )

    beta = (
        rolling_beta(aligned["leg_a"], aligned["leg_b"], beta_window=config.beta_window)
        if method == "beta"
        else pd.Series(np.nan, index=aligned.index, dtype=float)
    )
    value = spread_series(
        aligned["leg_a"], aligned["leg_b"], method, beta_window=config.beta_window
    ).reindex(aligned.index)
    rolls = detect_roll_suspects(
        value,
        window=config.roll_window,
        min_periods=config.roll_min_periods,
    ).reindex(aligned.index, fill_value=False)

    records: list[dict[str, float | bool | str]] = []
    clean_history: list[float] = []
    for session, raw_value in value.items():
        current = float(raw_value) if pd.notna(raw_value) else math.nan
        roll_suspect = bool(rolls.loc[session]) if pd.notna(current) else False

        z_30, _, _ = _z_from_history(current, clean_history, 30)
        z_60, mean_60, std_60 = _z_from_history(current, clean_history, config.lookback)
        z_90, _, _ = _z_from_history(current, clean_history, 90)

        if roll_suspect or not math.isfinite(current):
            # A roll day is charted, but cannot be a statistical dislocation.
            z_30 = z_60 = z_90 = mean_60 = std_60 = math.nan
            pct_rank = math.nan
        else:
            pct_rank = _percentile_rank(current, clean_history, config.percentile_window)

        diagnostic_sample = clean_history[-config.diagnostics_window :]
        records.append(
            {
                "value": current,
                "mean_60": mean_60,
                "std_60": std_60,
                "z": z_60,
                "pct_rank_252": pct_rank,
                "half_life": estimate_half_life(diagnostic_sample),
                "beta": float(beta.loc[session]) if pd.notna(beta.loc[session]) else math.nan,
                "roll_suspect": roll_suspect,
                "adf_p": adf_pvalue(diagnostic_sample),
                "z_30": z_30,
                "z_90": z_90,
                "stability": _stability_label((z_30, z_60, z_90), config.stability_max_z_dispersion),
            }
        )

        # Add today's value only after every baseline/diagnostic above has been
        # evaluated.  This is the worker's central no-lookahead guardrail.
        if math.isfinite(current) and not roll_suspect:
            clean_history.append(current)

    frame = pd.DataFrame(records, index=aligned.index)
    frame.index.name = "d"
    return frame


def build_signal_rows(
    frame: pd.DataFrame,
    *,
    pair_id: int,
    entry_z: float,
    cooldown_sessions: int = 5,
) -> list[dict[str, int | str | float | bool]]:
    """Build idempotent signal rows while enforcing a five-session cooldown.

    Signals are calculated sequentially over sessions, rather than with a
    calendar-day subtraction, so holidays and market-specific missing days do
    not silently shorten the cooldown.
    """

    if cooldown_sessions < 1:
        raise ValueError("cooldown_sessions must be at least 1.")
    if frame.empty:
        return []

    latest_session = pd.Timestamp(frame.index.max()).date()
    last_signal_position: int | None = None
    rows: list[dict[str, int | str | float | bool]] = []

    for position, (session, row) in enumerate(frame.iterrows()):
        z = row.get("z")
        adf_p = row.get("adf_p")
        if (
            bool(row.get("roll_suspect", False))
            or pd.isna(z)
            or pd.isna(adf_p)
            or abs(float(z)) < entry_z
            or float(adf_p) >= 0.10
        ):
            continue
        if last_signal_position is not None and position - last_signal_position < cooldown_sessions:
            continue

        signal_date = pd.Timestamp(session).date()
        rows.append(
            {
                "pair_id": pair_id,
                "d": signal_date.isoformat(),
                "z": float(z),
                "direction": "short_spread" if float(z) > 0 else "long_spread",
                # Historical backfill must not emit an alert storm. Only an
                # unnotified latest-session signal is eligible for delivery.
                "notified": signal_date != latest_session,
            }
        )
        last_signal_position = position

    return rows
