"""Оценка форварда: PV = (S0 - K) * notional * exp(-r*T)."""
from __future__ import annotations

import math

from ..data.models import OptionPosition


def price_forward(position: OptionPosition) -> float:
    t = position.time_to_maturity()
    pv = (position.underlying_price - position.strike) * position.notional
    return pv * math.exp(-position.risk_free_rate * t)


__all__ = ["price_forward"]
