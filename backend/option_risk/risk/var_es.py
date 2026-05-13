"""VaR/ES и ликвидно-скорректированный VaR."""
from __future__ import annotations

import math
import statistics
from dataclasses import asdict, dataclass
from typing import Iterable, List, Optional, Sequence, Tuple

import numpy as np


EPS = 1e-12

TAIL_MODEL_NORMAL = "normal"
TAIL_MODEL_CORNISH_FISHER = "cornish_fisher"
_SUPPORTED_TAIL_MODELS = {TAIL_MODEL_NORMAL, TAIL_MODEL_CORNISH_FISHER}


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


def _normalized_weights(weights: Optional[Iterable[float]], n_obs: int) -> Optional[np.ndarray]:
    if weights is None:
        return None
    arr = np.asarray(list(weights), dtype=np.float64)
    if arr.size != n_obs:
        raise ValueError("Количество весов сценариев должно совпадать с количеством наблюдений PnL")
    if not np.isfinite(arr).all():
        raise ValueError("Веса сценариев должны быть конечными числами")
    if np.any(arr < 0.0):
        raise ValueError("Веса сценариев не могут быть отрицательными")
    total = float(np.sum(arr, dtype=np.float64))
    if total <= 0.0:
        raise ValueError("Сумма весов сценариев должна быть положительной")
    return arr / total


def _tail_count(n_obs: int, confidence_level: float) -> int:
    tail_prob = 1.0 - confidence_level
    # Excel-подобная дискретная конвенция: k = ceil(N * tail_prob), минимум 1 наблюдение.
    return max(1, int(math.ceil(n_obs * tail_prob - EPS)))


def historical_var(
    pnls: Iterable[float],
    alpha: float = 0.99,
    scenario_weights: Optional[Iterable[float]] = None,
) -> float:
    """Historical VaR на PnL с дискретным квантилем без интерполяции."""
    cl = _validate_confidence_level(alpha)
    arr = np.asarray(list(pnls), dtype=np.float64)
    if arr.size == 0:
        raise ValueError("Пустой набор PnL")
    weights = _normalized_weights(scenario_weights, arr.size)
    if weights is None:
        sorted_pnls = np.sort(arr)
        k = _tail_count(sorted_pnls.size, cl)
        var_pnl = float(sorted_pnls[k - 1])
    else:
        order = np.argsort(arr)
        sorted_pnls = arr[order]
        sorted_weights = weights[order]
        tail_prob = 1.0 - cl
        cum_weights = np.cumsum(sorted_weights, dtype=np.float64)
        idx = int(np.searchsorted(cum_weights, tail_prob - EPS, side="left"))
        idx = max(0, min(idx, sorted_pnls.size - 1))
        var_pnl = float(sorted_pnls[idx])
    return max(0.0, -var_pnl)


def historical_es(
    pnls: Iterable[float],
    alpha: float = 0.99,
    scenario_weights: Optional[Iterable[float]] = None,
) -> float:
    """Historical ES как средний убыток по худшему хвосту PnL (включая VaR-точку)."""
    cl = _validate_confidence_level(alpha)
    arr = np.asarray(list(pnls), dtype=np.float64)
    if arr.size == 0:
        raise ValueError("Пустой набор PnL")
    weights = _normalized_weights(scenario_weights, arr.size)
    if weights is None:
        sorted_pnls = np.sort(arr)
        k = _tail_count(sorted_pnls.size, cl)
        tail_mean_pnl = float(np.mean(sorted_pnls[:k], dtype=np.float64))
    else:
        order = np.argsort(arr)
        sorted_pnls = arr[order]
        sorted_weights = weights[order]
        tail_prob = 1.0 - cl
        remaining = tail_prob
        tail_sum = 0.0
        for pnl, weight in zip(sorted_pnls, sorted_weights):
            if remaining <= EPS:
                break
            take = min(float(weight), remaining)
            tail_sum += float(pnl) * take
            remaining -= take
        tail_mean_pnl = tail_sum / tail_prob
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


def _validate_tail_model(tail_model: str) -> str:
    model = str(tail_model).strip().lower() if tail_model is not None else TAIL_MODEL_NORMAL
    if model not in _SUPPORTED_TAIL_MODELS:
        raise ValueError(
            "Неизвестная параметрическая tail-модель. "
            "Ожидается: normal|cornish_fisher"
        )
    return model


def _sample_skew_excess_kurtosis(values: np.ndarray) -> Tuple[float, float]:
    if values.size < 3:
        return 0.0, 0.0
    mean = float(np.mean(values, dtype=np.float64))
    sigma = float(np.std(values, ddof=1))
    if sigma <= 0.0 or not math.isfinite(sigma):
        return 0.0, 0.0
    z = (values - mean) / sigma
    skew = float(np.mean(z**3, dtype=np.float64))
    if values.size < 4:
        return skew if math.isfinite(skew) else 0.0, 0.0
    excess_kurtosis = float(np.mean(z**4, dtype=np.float64) - 3.0)
    if not math.isfinite(skew):
        skew = 0.0
    if not math.isfinite(excess_kurtosis):
        excess_kurtosis = 0.0
    return skew, excess_kurtosis


def _cornish_fisher_z(z: float, skew: float, excess_kurtosis: float) -> float:
    z2 = z * z
    z3 = z2 * z
    return (
        z
        + (z2 - 1.0) * skew / 6.0
        + (z3 - 3.0 * z) * excess_kurtosis / 24.0
        - (2.0 * z3 - 5.0 * z) * (skew * skew) / 36.0
    )


def _parametric_tail_z(pnls: np.ndarray, alpha: float, tail_model: str) -> float:
    z = statistics.NormalDist().inv_cdf(alpha)
    if tail_model == TAIL_MODEL_NORMAL or pnls.size < 3:
        return z
    # Cornish-Fisher применяется к распределению убытков (loss = -PnL).
    losses = -pnls
    skew, excess_kurtosis = _sample_skew_excess_kurtosis(losses)
    z_cf = _cornish_fisher_z(z, skew, excess_kurtosis)
    if not math.isfinite(z_cf):
        return z
    # Используем консервативный вариант: усиленный хвост не должен быть слабее Normal.
    return max(z, z_cf)


def parametric_var(
    pnls: Iterable[float],
    alpha: float = 0.99,
    horizon_days: float = 1.0,
    tail_model: str = TAIL_MODEL_NORMAL,
) -> float:
    cl = _validate_confidence_level(alpha)
    model = _validate_tail_model(tail_model)
    arr = np.asarray(list(pnls), dtype=np.float64)
    mu, sigma = _sample_mean_std(arr)
    horizon = max(1.0, float(horizon_days))
    mu_h = mu * horizon
    sigma_h = sigma * math.sqrt(horizon)
    z = _parametric_tail_z(arr, cl, model)
    return max(0.0, (-mu_h) + sigma_h * z)


def parametric_es(
    pnls: Iterable[float],
    alpha: float = 0.99,
    horizon_days: float = 1.0,
    tail_model: str = TAIL_MODEL_NORMAL,
) -> float:
    cl = _validate_confidence_level(alpha)
    model = _validate_tail_model(tail_model)
    arr = np.asarray(list(pnls), dtype=np.float64)
    mu, sigma = _sample_mean_std(arr)
    horizon = max(1.0, float(horizon_days))
    mu_h = mu * horizon
    sigma_h = sigma * math.sqrt(horizon)
    if sigma_h == 0.0:
        return max(0.0, -mu_h)
    z = _parametric_tail_z(arr, cl, model)
    pdf = (1.0 / math.sqrt(2.0 * math.pi)) * math.exp(-0.5 * z * z)
    if model == TAIL_MODEL_NORMAL:
        es_loss = (-mu_h) + sigma_h * (pdf / (1.0 - cl))
    else:
        alpha_eff = min(1.0 - EPS, max(cl, statistics.NormalDist().cdf(z)))
        es_loss = (-mu_h) + sigma_h * (pdf / (1.0 - alpha_eff))
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
    max_rows: Optional[int] = None,
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

    if max_rows is not None and max_rows > 0 and len(rows) > max_rows:
        rows.sort(key=lambda row: abs(row.add_on_money), reverse=True)
        rows = rows[:max_rows]
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
