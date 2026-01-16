"""Биномиальная модель (CRR) для европейских и американских опционов."""
from __future__ import annotations

import math

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

    prices = [0.0] * (steps + 1)
    values = [0.0] * (steps + 1)
    s0 = position.underlying_price
    k = position.strike

    for i in range(steps + 1):
        prices[i] = s0 * (u ** (steps - i)) * (d**i)
        if position.option_type == OptionType.CALL:
            values[i] = max(prices[i] - k, 0.0)
        else:
            values[i] = max(k - prices[i], 0.0)

    for step in range(steps - 1, -1, -1):
        for i in range(step + 1):
            continuation = disc * (p * values[i] + (1 - p) * values[i + 1])
            if position.option_type == OptionType.CALL:
                exercise = max(prices[i] / u - k, 0.0)
            else:
                exercise = max(k - prices[i] / u, 0.0)
            if position.style == OptionStyle.AMERICAN:
                values[i] = max(continuation, exercise)
            else:
                values[i] = continuation
            prices[i] = prices[i] / u
    return values[0]


__all__ = ["price"]
