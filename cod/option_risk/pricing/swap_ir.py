"""Упрощенный процентный своп: PV фикс-плавающая за ближайший период."""
from __future__ import annotations

import math

from ..data.models import OptionPosition


def price_swap_ir(position: OptionPosition) -> float:
    fixed_rate = position.fixed_rate if position.fixed_rate is not None else position.strike
    float_rate = position.float_rate if position.float_rate is not None else position.risk_free_rate
    day_count = position.day_count or position.time_to_maturity()
    net_rate = (float_rate - fixed_rate) * day_count
    pv = position.notional * net_rate
    return pv * math.exp(-position.risk_free_rate * position.time_to_maturity())


__all__ = ["price_swap_ir"]
