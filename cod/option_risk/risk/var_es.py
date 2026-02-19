"""VaR/ES и ликвидно-скорректированный VaR."""
from __future__ import annotations

import math
import statistics
from dataclasses import asdict, dataclass
from typing import Iterable, List, Sequence, Tuple

import numpy as np


EPS = 1e-12


@dataclass
class LiquidityInput:
    position_id: str
    quantity: float
    position_value: float
    haircut: float


@dataclass
class LiquidityAddonItem:
    position_id: str
    model: str
    quantity: float
    position_value: float
    haircut_input: float
    add_on_money: float

    def to_dict(self) -> dict:
        return asdict(self)


def _validate_confidence_level(confidence_level: float) -> float:
    cl = float(confidence_level)
    if not (0.0 < cl < 1.0):
        raise ValueError("Confidence level должен быть в интервале (0, 1)")
    return cl


def _sorted_pnls(pnls: Iterable[float]) -> np.ndarray:
    arr = np.asarray(list(pnls), dtype=np.float64)
    if arr.size == 0:
        raise ValueError("Пустой набор PnL")
    return np.sort(arr)


def _tail_count(n_obs: int, confidence_level: float) -> int:
    tail_prob = 1.0 - confidence_level
    # Excel-подобная дискретная конвенция: k = ceil(N * tail_prob), минимум 1 наблюдение.
    return max(1, int(math.ceil(n_obs * tail_prob - EPS)))


def historical_var(pnls: Iterable[float], alpha: float = 0.99) -> float:
    """Historical VaR на PnL с дискретным квантилем без интерполяции."""
    cl = _validate_confidence_level(alpha)
    sorted_pnls = _sorted_pnls(pnls)
    k = _tail_count(sorted_pnls.size, cl)
    var_pnl = float(sorted_pnls[k - 1])
    return max(0.0, -var_pnl)


def historical_es(pnls: Iterable[float], alpha: float = 0.99) -> float:
    """Historical ES как средний убыток по худшему хвосту PnL (включая VaR-точку)."""
    cl = _validate_confidence_level(alpha)
    sorted_pnls = _sorted_pnls(pnls)
    k = _tail_count(sorted_pnls.size, cl)
    tail_mean_pnl = float(np.mean(sorted_pnls[:k], dtype=np.float64))
    return max(0.0, -tail_mean_pnl)


def _sample_mean_std(pnls: Iterable[float]) -> Tuple[float, float]:
    arr = np.asarray(list(pnls), dtype=np.float64)
    if arr.size == 0:
        raise ValueError("Пустой набор PnL")
    mu = float(np.mean(arr, dtype=np.float64))
    if arr.size < 2:
        return mu, 0.0
    sigma = float(np.std(arr, ddof=1))
    if not math.isfinite(sigma):
        sigma = 0.0
    return mu, max(0.0, sigma)


def parametric_var(pnls: Iterable[float], alpha: float = 0.99, horizon_days: float = 1.0) -> float:
    cl = _validate_confidence_level(alpha)
    mu, sigma = _sample_mean_std(pnls)
    horizon = max(1.0, float(horizon_days))
    mu_h = mu * horizon
    sigma_h = sigma * math.sqrt(horizon)
    z = statistics.NormalDist().inv_cdf(cl)
    return max(0.0, (-mu_h) + sigma_h * z)


def parametric_es(pnls: Iterable[float], alpha: float = 0.99, horizon_days: float = 1.0) -> float:
    cl = _validate_confidence_level(alpha)
    mu, sigma = _sample_mean_std(pnls)
    horizon = max(1.0, float(horizon_days))
    mu_h = mu * horizon
    sigma_h = sigma * math.sqrt(horizon)
    if sigma_h == 0.0:
        return max(0.0, -mu_h)
    z = statistics.NormalDist().inv_cdf(cl)
    pdf = (1.0 / math.sqrt(2.0 * math.pi)) * math.exp(-0.5 * z * z)
    es_loss = (-mu_h) + sigma_h * (pdf / (1.0 - cl))
    return max(0.0, es_loss)


def _liquidity_addon_money(item: LiquidityInput, model: str) -> float:
    model_name = model.strip().lower()
    haircut = max(0.0, float(item.haircut))
    position_value_abs = abs(float(item.position_value))
    quantity_abs = abs(float(item.quantity))

    if model_name == "fraction_of_position_value":
        return haircut * position_value_abs
    if model_name == "half_spread_fraction":
        return 0.5 * haircut * position_value_abs
    if model_name == "absolute_per_contract":
        return quantity_abs * haircut
    raise ValueError(
        f"Неизвестная liquidity модель '{model}'. "
        "Ожидается: fraction_of_position_value|half_spread_fraction|absolute_per_contract"
    )


def liquidity_addon_breakdown(
    positions: Sequence[LiquidityInput],
    model: str = "fraction_of_position_value",
) -> Tuple[float, List[LiquidityAddonItem]]:
    rows: List[LiquidityAddonItem] = []
    total = 0.0
    for item in positions:
        add_on = _liquidity_addon_money(item, model=model)
        total += add_on
        rows.append(
            LiquidityAddonItem(
                position_id=item.position_id,
                model=model,
                quantity=float(item.quantity),
                position_value=float(item.position_value),
                haircut_input=float(item.haircut),
                add_on_money=float(add_on),
            )
        )
    return float(total), rows


def liquidity_adjusted_var(base_var: float, liquidity_charge: float | Sequence[float]) -> float:
    """LC VaR как VaR + ликвидностная надбавка в деньгах."""
    if isinstance(liquidity_charge, (list, tuple, np.ndarray)):
        charge_value = float(np.sum(np.asarray(liquidity_charge, dtype=np.float64)))
    else:
        charge_value = float(liquidity_charge)
    return float(base_var) + max(0.0, charge_value)


__all__ = [
    "historical_var",
    "historical_es",
    "parametric_var",
    "parametric_es",
    "LiquidityInput",
    "LiquidityAddonItem",
    "liquidity_addon_breakdown",
    "liquidity_adjusted_var",
]
