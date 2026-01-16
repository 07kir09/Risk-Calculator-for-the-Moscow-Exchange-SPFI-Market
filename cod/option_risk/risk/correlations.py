"""Корреляции PnL по позициям/сценариям."""
from __future__ import annotations

import numpy as np

from ..data.models import MarketScenario, Portfolio
from .portfolio import apply_scenario
from .portfolio import position_value


def pnl_matrix(portfolio: Portfolio, scenarios: list[MarketScenario]) -> np.ndarray:
    """Матрица PnL: строки — позиции, столбцы — сценарии."""
    n_pos = len(portfolio.positions)
    n_scen = len(scenarios)
    mat = np.zeros((n_pos, n_scen), dtype=np.float64)
    base_values = [position_value(p) for p in portfolio.positions]
    for j, s in enumerate(scenarios):
        for i, p in enumerate(portfolio.positions):
            stressed = apply_scenario(p, s)
            mat[i, j] = position_value(stressed) - base_values[i]
    return mat


def correlation_matrix(portfolio: Portfolio, scenarios: list[MarketScenario]) -> np.ndarray:
    """Корреляционная матрица PnL между позициями."""
    mat = pnl_matrix(portfolio, scenarios)
    if mat.shape[1] < 2:
        raise ValueError("Нужно минимум два сценария для корреляции")
    return np.corrcoef(mat)


__all__ = ["pnl_matrix", "correlation_matrix"]
