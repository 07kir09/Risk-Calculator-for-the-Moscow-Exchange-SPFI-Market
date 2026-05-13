"""Численные греки через центральные разности."""
from __future__ import annotations

import datetime as dt

from ..data.models import OptionPosition
from ..pricing.engine import price_position


def _bump(value: float, step: float) -> float:
    return value + step


def delta(position: OptionPosition, step: float | None = None) -> float:
    h = step or max(0.01, position.underlying_price * 1e-4)
    up = position.copy(update={"underlying_price": _bump(position.underlying_price, h)})
    down = position.copy(update={"underlying_price": _bump(position.underlying_price, -h)})
    return (price_position(up) - price_position(down)) / (2 * h)


def gamma(position: OptionPosition, step: float | None = None) -> float:
    h = step or max(0.01, position.underlying_price * 1e-4)
    up = position.copy(update={"underlying_price": _bump(position.underlying_price, h)})
    down = position.copy(update={"underlying_price": _bump(position.underlying_price, -h)})
    mid = position
    return (price_position(up) - 2 * price_position(mid) + price_position(down)) / (h * h)


def vega(position: OptionPosition, step: float | None = None) -> float:
    h = step or max(1e-4, position.volatility * 1e-3)
    up = position.copy(update={"volatility": _bump(position.volatility, h)})
    down = position.copy(update={"volatility": _bump(position.volatility, -h)})
    return (price_position(up) - price_position(down)) / (2 * h)


def theta(position: OptionPosition, step: float = 1.0 / 365.0) -> float:
    """Приближение Тета через сдвиг даты оценки на один день."""
    up = position.copy(update={"valuation_date": position.valuation_date + dt.timedelta(days=1)})
    down = position.copy(update={"valuation_date": position.valuation_date - dt.timedelta(days=1)})
    return (price_position(down) - price_position(up)) / (2 * step)


def rho(position: OptionPosition, step: float | None = None) -> float:
    h = step or max(1e-4, abs(position.risk_free_rate) * 1e-3 + 1e-4)
    up = position.copy(update={"risk_free_rate": position.risk_free_rate + h})
    down = position.copy(update={"risk_free_rate": position.risk_free_rate - h})
    return (price_position(up) - price_position(down)) / (2 * h)


__all__ = ["delta", "gamma", "vega", "theta", "rho"]
