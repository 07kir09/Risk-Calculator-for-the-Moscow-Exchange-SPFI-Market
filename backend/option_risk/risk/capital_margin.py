"""Оценка капитала и маржи на базе VaR/ES."""
from __future__ import annotations


def economic_capital(var_value: float, es_value: float) -> float:
    """Простая метрика капитала: максимум из VaR и ES."""
    return max(var_value, es_value)


def initial_margin(lc_var: float) -> float:
    """Начальная маржа как LC VaR (ликвидно-скорректированный VaR)."""
    return lc_var


def variation_margin(pnl: float) -> float:
    """Вариационная маржа = PnL выбранного референсного сценария."""
    return pnl


__all__ = ["economic_capital", "initial_margin", "variation_margin"]
