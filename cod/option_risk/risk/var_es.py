"""VaR/ES и ликвидно-скорректированный VaR."""
from __future__ import annotations

import math
import statistics
from typing import Iterable, List

import numpy as np


def historical_var(pnls: Iterable[float], alpha: float = 0.99) -> float:
    arr = np.asarray(list(pnls), dtype=np.float64)
    if arr.size == 0:
        raise ValueError("Пустой набор PnL для расчета VaR")
    losses = -arr
    quantile = np.quantile(losses, alpha, method="linear")
    return float(quantile)


def historical_es(pnls: Iterable[float], alpha: float = 0.99) -> float:
    arr = np.asarray(list(pnls), dtype=np.float64)
    if arr.size == 0:
        raise ValueError("Пустой набор PnL для расчета ES")
    losses = -arr
    var_level = historical_var(pnls, alpha)
    tail = losses[losses >= var_level]
    return float(np.mean(tail, dtype=np.float64))


def parametric_var(pnls: Iterable[float], alpha: float = 0.99) -> float:
    arr = np.asarray(list(pnls), dtype=np.float64)
    if arr.size == 0:
        raise ValueError("Пустой набор PnL для расчета параметрического VaR")
    mu = float(np.mean(arr, dtype=np.float64))
    sigma = float(np.std(arr, ddof=1))
    z = statistics.NormalDist().inv_cdf(alpha)
    return max(0.0, (-mu) + sigma * z)


def parametric_es(pnls: Iterable[float], alpha: float = 0.99) -> float:
    arr = np.asarray(list(pnls), dtype=np.float64)
    if arr.size == 0:
        raise ValueError("Пустой набор PnL для расчета параметрического ES")
    mu = float(np.mean(arr, dtype=np.float64))
    sigma = float(np.std(arr, ddof=1))
    z = statistics.NormalDist().inv_cdf(alpha)
    pdf = (1 / math.sqrt(2 * math.pi)) * math.exp(-0.5 * z * z)
    es_loss = (-mu) + sigma * (pdf / (1 - alpha))
    return es_loss


def liquidity_adjusted_var(base_var: float, positions_liquidity: List[float]) -> float:
    """LC VaR как VaR + суммарные ликвидностные надбавки."""
    liquidity_charge = float(np.sum(np.asarray(positions_liquidity, dtype=np.float64)))
    return base_var + liquidity_charge


__all__ = ["historical_var", "historical_es", "parametric_var", "parametric_es", "liquidity_adjusted_var"]
