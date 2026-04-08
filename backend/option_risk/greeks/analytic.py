"""Аналитические греки для модели Black–Scholes."""
from __future__ import annotations

import math

from ..data.models import OptionPosition, OptionType
from ..pricing import black_scholes


def delta(position: OptionPosition) -> float:
    d1, _ = black_scholes.d1_d2(position)
    t = position.time_to_maturity()
    if position.option_type == OptionType.CALL:
        return math.exp(-position.dividend_yield * t) * black_scholes._norm_cdf(d1)
    return -math.exp(-position.dividend_yield * t) * black_scholes._norm_cdf(-d1)


def gamma(position: OptionPosition) -> float:
    d1, _ = black_scholes.d1_d2(position)
    t = position.time_to_maturity()
    return (
        math.exp(-position.dividend_yield * t)
        * black_scholes._norm_pdf(d1)
        / (position.underlying_price * position.volatility * math.sqrt(t))
    )


def vega(position: OptionPosition) -> float:
    d1, _ = black_scholes.d1_d2(position)
    t = position.time_to_maturity()
    return position.underlying_price * math.exp(-position.dividend_yield * t) * black_scholes._norm_pdf(d1) * math.sqrt(t)


def theta(position: OptionPosition) -> float:
    d1, d2 = black_scholes.d1_d2(position)
    t = position.time_to_maturity()
    s = position.underlying_price
    k = position.strike
    r = position.risk_free_rate
    q = position.dividend_yield
    pdf = black_scholes._norm_pdf(d1)
    term1 = -(s * pdf * position.volatility * math.exp(-q * t)) / (2 * math.sqrt(t))
    if position.option_type == OptionType.CALL:
        term2 = q * s * math.exp(-q * t) * black_scholes._norm_cdf(d1)
        term3 = r * k * math.exp(-r * t) * black_scholes._norm_cdf(d2)
        return term1 - term2 - term3
    term2 = q * s * math.exp(-q * t) * black_scholes._norm_cdf(-d1)
    term3 = r * k * math.exp(-r * t) * black_scholes._norm_cdf(-d2)
    return term1 + term2 + term3


def rho(position: OptionPosition) -> float:
    _, d2 = black_scholes.d1_d2(position)
    t = position.time_to_maturity()
    k = position.strike
    r = position.risk_free_rate
    if position.option_type == OptionType.CALL:
        return k * t * math.exp(-r * t) * black_scholes._norm_cdf(d2)
    return -k * t * math.exp(-r * t) * black_scholes._norm_cdf(-d2)


__all__ = ["delta", "gamma", "vega", "theta", "rho"]
