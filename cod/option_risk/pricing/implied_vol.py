"""Расчет подразумеваемой волатильности для европейских опционов."""
from __future__ import annotations

import math

from ..data.models import OptionPosition
from . import black_scholes


def _vega(position: OptionPosition) -> float:
    d1, _ = black_scholes.d1_d2(position)
    return position.underlying_price * math.exp(-position.dividend_yield * position.time_to_maturity()) * black_scholes._norm_pdf(d1) * math.sqrt(position.time_to_maturity())


def implied_volatility(
    position: OptionPosition,
    market_price: float,
    tol: float = 1e-8,
    max_iter: int = 100,
    low: float = 1e-4,
    high: float = 5.0,
) -> float:
    """Нахождение IV методом Ньютона с резервной бисекцией."""
    if market_price <= 0:
        raise ValueError("Рыночная цена должна быть положительной для расчета IV")
    guess = position.volatility
    for _ in range(max_iter):
        position.volatility = guess
        model_price = black_scholes.price(position)
        diff = model_price - market_price
        if abs(diff) < tol:
            return float(guess)
        vega = _vega(position)
        if vega <= 0:
            break
        guess -= diff / vega
        if guess <= low or guess >= high:
            break

    # Бисекция при неудаче Ньютона
    left, right = low, high
    for _ in range(max_iter):
        mid = 0.5 * (left + right)
        position.volatility = mid
        mid_price = black_scholes.price(position)
        if abs(mid_price - market_price) < tol:
            return float(mid)
        if mid_price > market_price:
            right = mid
        else:
            left = mid
    raise ValueError("Не удалось найти подразумеваемую волатильность с заданной точностью")


__all__ = ["implied_volatility"]
