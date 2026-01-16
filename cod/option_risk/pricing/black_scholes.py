"""Реализация формул Black–Scholes для европейских опционов."""
from __future__ import annotations

import math

from ..data.models import OptionType, OptionPosition


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return (1.0 / math.sqrt(2.0 * math.pi)) * math.exp(-0.5 * x * x)


def d1_d2(position: OptionPosition) -> tuple[float, float]:
    t = position.time_to_maturity()
    if t <= 0:
        raise ValueError("Время до экспирации должно быть положительным для BS")
    sigma = position.volatility
    s = position.underlying_price
    k = position.strike
    r = position.risk_free_rate
    q = position.dividend_yield
    d1 = (math.log(s / k) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)
    return d1, d2


def price(position: OptionPosition) -> float:
    """Цена европейского опциона по модели Black–Scholes."""
    d1, d2 = d1_d2(position)
    s = position.underlying_price
    k = position.strike
    r = position.risk_free_rate
    q = position.dividend_yield
    t = position.time_to_maturity()
    if position.option_type == OptionType.CALL:
        return s * math.exp(-q * t) * _norm_cdf(d1) - k * math.exp(-r * t) * _norm_cdf(d2)
    return k * math.exp(-r * t) * _norm_cdf(-d2) - s * math.exp(-q * t) * _norm_cdf(-d1)


def intrinsic_value(position: OptionPosition) -> float:
    """Внутренняя стоимость опциона (для граничных случаев)."""
    if position.option_type == OptionType.CALL:
        return max(position.underlying_price - position.strike, 0.0)
    return max(position.strike - position.underlying_price, 0.0)


def price_or_intrinsic(position: OptionPosition) -> float:
    """Цена BS, но при t<=0 возвращает выплату."""
    t = position.time_to_maturity()
    if t <= 0:
        return intrinsic_value(position)
    return price(position)


__all__ = ["price", "price_or_intrinsic", "d1_d2", "_norm_cdf", "_norm_pdf"]
