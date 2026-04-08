"""Монте-Карло оценка европейских опционов на базисе GBM."""
from __future__ import annotations

import math
from typing import Optional

import numpy as np

from ..data.models import OptionPosition, OptionType


def price(
    position: OptionPosition,
    n_paths: int = 50_000,
    seed: Optional[int] = 42,
) -> float:
    if n_paths <= 0:
        raise ValueError("Число сценариев Монте-Карло должно быть положительным")
    t = position.time_to_maturity()
    if t <= 0:
        from .black_scholes import intrinsic_value

        return intrinsic_value(position)

    rng = np.random.default_rng(seed)
    sigma = position.volatility
    r = position.risk_free_rate
    q = position.dividend_yield
    s0 = position.underlying_price
    k = position.strike

    drift = (r - q - 0.5 * sigma * sigma) * t
    diffusion = sigma * math.sqrt(t) * rng.standard_normal(n_paths, dtype=np.float64)
    st = s0 * np.exp(drift + diffusion)

    if position.option_type == OptionType.CALL:
        payoff = np.maximum(st - k, 0.0, dtype=np.float64)
    else:
        payoff = np.maximum(k - st, 0.0, dtype=np.float64)

    discounted = np.exp(-r * t, dtype=np.float64) * payoff
    return float(discounted.mean(dtype=np.float64))


__all__ = ["price"]
