"""Биномиальная модель (CRR) для европейских и американских опционов."""
from __future__ import annotations

import math

import numpy as np

from ..data.models import OptionPosition, OptionStyle, OptionType


def price(position: OptionPosition, steps: int = 200) -> float:
    if steps <= 0:
        raise ValueError("Число шагов в дереве должно быть положительным")
    t = position.time_to_maturity()
    if t <= 0:
        from .black_scholes import intrinsic_value

        return intrinsic_value(position)

    dt = t / steps
    sigma = position.volatility
    r = position.risk_free_rate
    q = position.dividend_yield

    u = math.exp(sigma * math.sqrt(dt))
    d = 1 / u
    disc = math.exp(-r * dt)
    p = (math.exp((r - q) * dt) - d) / (u - d)
    if p < 0 or p > 1:
        raise ValueError("Риск-нейтральная вероятность вышла за пределы [0,1]")

    s0 = position.underlying_price
    k = position.strike
    # Векторизованный backward induction: быстрее при больших портфелях/многих сценариях.
    j = np.arange(steps + 1, dtype=np.float64)
    prices = s0 * (u ** (steps - j)) * (d**j)
    if position.option_type == OptionType.CALL:
        values = np.maximum(prices - k, 0.0)
    else:
        values = np.maximum(k - prices, 0.0)

    for _ in range(steps - 1, -1, -1):
        continuation = disc * (p * values[:-1] + (1.0 - p) * values[1:])
        prices = prices[:-1] / u
        if position.style == OptionStyle.AMERICAN:
            if position.option_type == OptionType.CALL:
                exercise = np.maximum(prices - k, 0.0)
            else:
                exercise = np.maximum(k - prices, 0.0)
            values = np.maximum(continuation, exercise)
        else:
            values = continuation
    return float(values[0])


__all__ = ["price"]
