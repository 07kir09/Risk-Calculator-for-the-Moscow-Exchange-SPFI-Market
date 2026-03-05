"""Пайплайн расчёта риска по шагам из методологии."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np

from ..data.loading import ValidationMessage
from ..data.models import MarketScenario, Portfolio
from .correlations import pnl_matrix
from .limits import check_limits
from .portfolio import greeks_summary, position_value
from .stress import run_stress_tests
from .var_es import (
    LiquidityInput,
    historical_es,
    historical_var,
    liquidity_addon_breakdown,
    liquidity_adjusted_var,
    parametric_es,
    parametric_var,
)
from .capital_margin import economic_capital, initial_margin, variation_margin


@dataclass
class CalculationConfig:
    calc_sensitivities: bool = True
    calc_var_es: bool = True
    calc_stress: bool = True
    calc_margin_capital: bool = True
    alpha: float = 0.99
    horizon_days: int = 1
    parametric_tail_model: str = "normal"
    base_currency: str = "RUB"
    fx_rates: Optional[Dict[str, float]] = None
    liquidity_model: str = "fraction_of_position_value"
    mode: str = "demo"  # demo | api
    aggregations: Optional[List[str]] = None  # например ["currency"]
    calc_correlations: bool = True
    max_correlation_positions: int = 2000
    max_pnl_matrix_cells: int = 100_000
    max_lc_breakdown_rows: int = 500


@dataclass
class CalculationResult:
    base_value: float
    var_hist: Optional[float] = None
    es_hist: Optional[float] = None
    var_param: Optional[float] = None
    es_param: Optional[float] = None
    lc_var: Optional[float] = None
    lc_var_addon: Optional[float] = None
    lc_var_breakdown: Optional[List[dict]] = None
    greeks: Optional[Dict[str, float]] = None
    stress: Optional[list] = None
    top_contributors: Optional[Dict[str, List[dict]]] = None
    limits: Optional[list] = None
    correlations: Optional[list] = None
    pnl_matrix: Optional[list] = None
    pnl_distribution: Optional[List[float]] = None
    buckets: Optional[Dict[str, Dict[str, float]]] = None
    base_currency: str = "RUB"
    confidence_level: float = 0.99
    horizon_days: int = 1
    parametric_tail_model: str = "normal"
    mode: str = "demo"
    methodology_note: Optional[str] = None
    fx_warning: Optional[str] = None
    liquidity_model: str = "fraction_of_position_value"
    capital: Optional[float] = None
    initial_margin: Optional[float] = None
    variation_margin: Optional[float] = None
    validation_log: List[ValidationMessage] = field(default_factory=list)


def aggregate_buckets(portfolio: Portfolio, agg_keys: Optional[List[str]] = None) -> Dict[str, Dict[str, float]]:
    """Простая агрегация экспозиций и чувствительностей по валюте/тикеру."""
    agg_keys = agg_keys or ["currency"]
    buckets: Dict[str, Dict[str, float]] = {}
    greeks = greeks_summary(portfolio)
    for p in portfolio.positions:
        for key in agg_keys:
            group = getattr(p, key, "default")
            if group not in buckets:
                buckets[group] = {"notional": 0.0, "quantity": 0.0}
                for gk in greeks.keys():
                    buckets[group][gk] = 0.0
            buckets[group]["notional"] += p.notional if hasattr(p, "notional") else p.quantity
            buckets[group]["quantity"] += p.quantity
    # добавим усреднённые греки по группам (глобальные греки доступны отдельно)
    return buckets


def _normalize_currency(currency: str) -> str:
    return currency.strip().upper()


def _resolve_fx_rates(
    portfolio: Portfolio,
    base_currency: str,
    fx_rates: Optional[Dict[str, float]],
    validation_log: List[ValidationMessage],
) -> np.ndarray:
    rates_cfg: Dict[str, float] = {}
    for key, value in (fx_rates or {}).items():
        code = _normalize_currency(key)
        rates_cfg[code] = float(value)
    rates_cfg[base_currency] = 1.0

    unique_currencies = {_normalize_currency(p.currency) for p in portfolio.positions}
    rates: List[float] = []
    missing: set[str] = set()
    for p in portfolio.positions:
        ccy = _normalize_currency(p.currency)
        rate = rates_cfg.get(ccy)
        if rate is None:
            # Минимальный fallback: считаем 1.0, но обязательно логируем предупреждение.
            missing.add(ccy)
            rate = 1.0
        rates.append(float(rate))

    if len(unique_currencies) > 1 and missing:
        validation_log.append(
            ValidationMessage(
                severity="WARNING",
                message=(
                    "В портфеле смешанные валюты, но нет FX-курсов для: "
                    f"{', '.join(sorted(missing))}. Использован fallback 1.0; "
                    "агрегированные метрики могут быть некорректны."
                ),
            )
        )
    return np.asarray(rates, dtype=np.float64)


def _resolve_scenario_weights(
    scenarios: List[MarketScenario],
    validation_log: List[ValidationMessage],
) -> Optional[List[float]]:
    if not scenarios:
        return None
    probs = [s.probability for s in scenarios]
    if all(prob is None for prob in probs):
        return None
    if any(prob is None for prob in probs):
        raise ValueError("Если probability задана хотя бы у одного сценария, она должна быть задана у всех сценариев")

    arr = np.asarray([float(prob) for prob in probs], dtype=np.float64)
    if not np.isfinite(arr).all():
        raise ValueError("Вероятности сценариев должны быть конечными числами")
    if np.any(arr < 0.0):
        raise ValueError("Вероятности сценариев не могут быть отрицательными")
    total = float(np.sum(arr, dtype=np.float64))
    if total <= 0.0:
        raise ValueError("Сумма вероятностей сценариев должна быть положительной")

    normalized = arr / total
    if not math.isclose(total, 1.0, rel_tol=1e-9, abs_tol=1e-12):
        validation_log.append(
            ValidationMessage(
                severity="INFO",
                message=(
                    "Вероятности сценариев нормализованы на сумму "
                    f"{total:.12g}."
                ),
            )
        )
    return normalized.tolist()


def _tail_count(n_obs: int, confidence_level: float) -> int:
    return max(1, int(math.ceil(n_obs * (1.0 - confidence_level) - 1e-12)))


def _top_rows(
    metric: str,
    position_ids: List[str],
    contributions: np.ndarray,
    scenario_id: Optional[str] = None,
    top_n: int = 5,
) -> List[dict]:
    rows = []
    for idx, pos_id in enumerate(position_ids):
        pnl_contribution = float(contributions[idx])
        row: Dict[str, Any] = {
            "metric": metric,
            "position_id": pos_id,
            "pnl_contribution": pnl_contribution,
            "abs_pnl_contribution": abs(pnl_contribution),
        }
        if scenario_id is not None:
            row["scenario_id"] = scenario_id
        rows.append(row)
    rows.sort(key=lambda x: x["abs_pnl_contribution"], reverse=True)
    return rows[:top_n]


def _build_top_contributors(
    portfolio: Portfolio,
    scenarios: List[MarketScenario],
    pnl_dist: List[float],
    position_pnl_matrix: np.ndarray,
    confidence_level: float,
) -> Dict[str, List[dict]]:
    if not pnl_dist or position_pnl_matrix.size == 0:
        return {}

    portfolio_pnl = np.asarray(pnl_dist, dtype=np.float64)
    order = np.argsort(portfolio_pnl)  # от худшего к лучшему
    tail_n = _tail_count(portfolio_pnl.size, confidence_level)
    tail_indices = order[:tail_n]
    var_scenario_idx = int(order[tail_n - 1])
    stress_scenario_idx = int(np.argmin(portfolio_pnl))

    pos_ids = [p.position_id for p in portfolio.positions]
    var_rows = _top_rows(
        metric="var_hist",
        position_ids=pos_ids,
        contributions=position_pnl_matrix[:, var_scenario_idx],
        scenario_id=scenarios[var_scenario_idx].scenario_id if scenarios else None,
    )
    es_rows = _top_rows(
        metric="es_hist",
        position_ids=pos_ids,
        contributions=np.mean(position_pnl_matrix[:, tail_indices], axis=1),
        scenario_id="tail_mean",
    )
    stress_rows = _top_rows(
        metric="stress",
        position_ids=pos_ids,
        contributions=position_pnl_matrix[:, stress_scenario_idx],
        scenario_id=scenarios[stress_scenario_idx].scenario_id if scenarios else None,
    )
    return {
        "var_hist": var_rows,
        "es_hist": es_rows,
        "stress": stress_rows,
    }


def run_calculation(
    portfolio: Portfolio,
    scenarios: List[MarketScenario],
    limits_cfg: Dict | None = None,
    config: CalculationConfig | None = None,
) -> CalculationResult:
    cfg = config or CalculationConfig()
    base_currency = _normalize_currency(cfg.base_currency)
    validation_log: List[ValidationMessage] = []
    position_ids = [p.position_id for p in portfolio.positions]
    fx_rates = _resolve_fx_rates(portfolio, base_currency, cfg.fx_rates, validation_log)
    scenario_weights = _resolve_scenario_weights(scenarios, validation_log) if (cfg.calc_var_es and scenarios) else None
    base_values = np.asarray([position_value(p) for p in portfolio.positions], dtype=np.float64)
    base_values_converted = base_values * fx_rates
    base_value = float(np.sum(base_values_converted, dtype=np.float64))

    # 4A Sensitivities
    greeks = greeks_summary(portfolio) if cfg.calc_sensitivities else None

    # 6 Сценарии и стресс
    pnl_dist: List[float] = []
    pnl_mat = None
    position_pnl_base = np.zeros((len(portfolio.positions), len(scenarios)), dtype=np.float64)
    if (cfg.calc_stress or cfg.calc_var_es or cfg.calc_correlations) and scenarios:
        position_pnl = pnl_matrix(portfolio, scenarios)
        position_pnl_base = position_pnl * fx_rates[:, None]
        pnl_dist = np.sum(position_pnl_base, axis=0, dtype=np.float64).tolist()
        if position_pnl_base.size <= max(0, int(cfg.max_pnl_matrix_cells)):
            pnl_mat = position_pnl_base.tolist()
        else:
            validation_log.append(
                ValidationMessage(
                    severity="WARNING",
                    message=(
                        "Матрица PnL слишком большая для API-ответа "
                        f"({position_pnl_base.shape[0]}x{position_pnl_base.shape[1]}). "
                        "Поле pnl_matrix пропущено."
                    ),
                )
            )

    stress = (
        run_stress_tests(
            portfolio,
            scenarios,
            limits=(limits_cfg or {}).get("stress") if limits_cfg else None,
            precomputed_pnls=pnl_dist if pnl_dist else None,
        )
        if cfg.calc_stress
        else None
    )

    # 7 VaR/ES
    var_h = es_h = var_p = es_p = lc_var = lc_addon = None
    lc_breakdown = None
    top_contributors = None
    if cfg.calc_var_es and pnl_dist:
        var_h = historical_var(pnl_dist, cfg.alpha, scenario_weights=scenario_weights)
        es_h = historical_es(pnl_dist, cfg.alpha, scenario_weights=scenario_weights)
        var_p = parametric_var(
            pnl_dist,
            cfg.alpha,
            horizon_days=cfg.horizon_days,
            tail_model=cfg.parametric_tail_model,
        )
        es_p = parametric_es(
            pnl_dist,
            cfg.alpha,
            horizon_days=cfg.horizon_days,
            tail_model=cfg.parametric_tail_model,
        )
        liq_inputs = [
            LiquidityInput(
                position_id=position_ids[idx],
                quantity=p.quantity,
                position_value=float(base_values_converted[idx]),
                haircut=p.liquidity_haircut,
            )
            for idx, p in enumerate(portfolio.positions)
        ]
        lc_addon, lc_break_rows = liquidity_addon_breakdown(
            liq_inputs,
            model=cfg.liquidity_model,
            max_rows=max(0, int(cfg.max_lc_breakdown_rows)) or None,
        )
        lc_breakdown = [row.to_dict() for row in lc_break_rows]
        if len(liq_inputs) > len(lc_break_rows):
            validation_log.append(
                ValidationMessage(
                    severity="WARNING",
                    message=(
                        "LC VaR breakdown сокращен для ответа API: "
                        f"показаны top-{len(lc_break_rows)} позиций по add-on."
                    ),
                )
            )
        lc_var = liquidity_adjusted_var(var_h, lc_addon)
        top_contributors = _build_top_contributors(
            portfolio=portfolio,
            scenarios=scenarios,
            pnl_dist=pnl_dist,
            position_pnl_matrix=position_pnl_base,
            confidence_level=cfg.alpha,
        )

    # 8 Лимиты
    limits = (
        check_limits(
            {
                "var_hist": var_h if var_h is not None else 0.0,
                "es_hist": es_h if es_h is not None else 0.0,
                "var_param": var_p if var_p is not None else 0.0,
                "es_param": es_p if es_p is not None else 0.0,
                "lc_var": lc_var if lc_var is not None else 0.0,
            },
            limits_cfg or {},
        )
        if limits_cfg
        else None
    )

    # 5 buckets
    buckets = aggregate_buckets(portfolio, cfg.aggregations)

    # Корреляции
    corr = None
    if cfg.calc_correlations and pnl_dist and len(scenarios) > 1 and position_pnl_base.shape[0] > 1 and position_pnl_base.shape[1] > 1:
        if position_pnl_base.shape[0] > max(1, int(cfg.max_correlation_positions)):
            validation_log.append(
                ValidationMessage(
                    severity="WARNING",
                    message=(
                        "Расчет корреляций пропущен: слишком много позиций "
                        f"({position_pnl_base.shape[0]} > {int(cfg.max_correlation_positions)})."
                    ),
                )
            )
        else:
            corr_matrix = np.asarray(np.corrcoef(position_pnl_base), dtype=np.float64)
            if not np.isfinite(corr_matrix).all():
                # При нулевой дисперсии ряда корреляция формально не определена (NaN).
                # Для API возвращаем численно устойчивую матрицу: диагональ=1, прочее=0.
                corr_matrix = np.nan_to_num(corr_matrix, nan=0.0, posinf=0.0, neginf=0.0)
                np.fill_diagonal(corr_matrix, 1.0)
                validation_log.append(
                    ValidationMessage(
                        severity="WARNING",
                        message=(
                            "Матрица корреляций содержала нечисловые значения (NaN/Inf) "
                            "из-за вырожденных сценариев; выполнена стабилизация значений."
                        ),
                    )
                )
            corr = corr_matrix.tolist()

    # 9 Маржа и капитал
    capital = initial_m = variation_m = None
    if cfg.calc_margin_capital:
        if var_h is not None and es_h is not None and lc_var is not None:
            capital = economic_capital(var_h, es_h)
            initial_m = initial_margin(lc_var)
        if pnl_dist:
            variation_m = variation_margin(pnl_dist[-1] if pnl_dist else 0.0)

    fx_warning = next((msg.message for msg in validation_log if "FX" in msg.message), None)
    methodology_note = (
        "Historical VaR/ES рассчитаны на наборе пользовательских сценариев (simulated demo), "
        "а не на историческом временном ряде рынка."
        if cfg.mode == "demo"
        else None
    )

    return CalculationResult(
        base_value=base_value,
        var_hist=var_h,
        es_hist=es_h,
        var_param=var_p,
        es_param=es_p,
        lc_var=lc_var,
        lc_var_addon=lc_addon,
        lc_var_breakdown=lc_breakdown,
        greeks=greeks,
        stress=stress,
        top_contributors=top_contributors,
        limits=limits,
        correlations=corr,
        pnl_matrix=pnl_mat,
        pnl_distribution=pnl_dist if pnl_dist else None,
        buckets=buckets,
        base_currency=base_currency,
        confidence_level=cfg.alpha,
        horizon_days=max(1, int(cfg.horizon_days)),
        parametric_tail_model=cfg.parametric_tail_model,
        mode=cfg.mode,
        methodology_note=methodology_note,
        fx_warning=fx_warning,
        liquidity_model=cfg.liquidity_model,
        capital=capital,
        initial_margin=initial_m,
        variation_margin=variation_m,
        validation_log=validation_log,
    )
