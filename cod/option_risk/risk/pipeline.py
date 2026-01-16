"""Пайплайн расчёта риска по шагам из методологии."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from ..data.loading import ValidationMessage
from ..data.models import MarketScenario, OptionPosition, Portfolio
from .correlations import correlation_matrix, pnl_matrix
from .limits import check_limits
from .portfolio import greeks_summary, portfolio_value, scenario_pnl_distribution
from .stress import run_stress_tests
from .var_es import historical_es, historical_var, liquidity_adjusted_var, parametric_es, parametric_var
from .capital_margin import economic_capital, initial_margin, variation_margin


@dataclass
class CalculationConfig:
    calc_sensitivities: bool = True
    calc_var_es: bool = True
    calc_stress: bool = True
    calc_margin_capital: bool = True
    alpha: float = 0.99
    aggregations: Optional[List[str]] = None  # например ["currency"]


@dataclass
class CalculationResult:
    base_value: float
    var_hist: Optional[float] = None
    es_hist: Optional[float] = None
    var_param: Optional[float] = None
    es_param: Optional[float] = None
    lc_var: Optional[float] = None
    greeks: Optional[Dict[str, float]] = None
    stress: Optional[list] = None
    limits: Optional[list] = None
    correlations: Optional[list] = None
    pnl_matrix: Optional[list] = None
    buckets: Optional[Dict[str, Dict[str, float]]] = None
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


def run_calculation(
    portfolio: Portfolio,
    scenarios: List[MarketScenario],
    limits_cfg: Dict | None = None,
    config: CalculationConfig | None = None,
) -> CalculationResult:
    cfg = config or CalculationConfig()
    base_value = portfolio_value(portfolio)
    validation_log: List[ValidationMessage] = []

    # 4A Sensitivities
    greeks = greeks_summary(portfolio) if cfg.calc_sensitivities else None

    # 6 Сценарии и стресс
    pnl_dist = scenario_pnl_distribution(portfolio, scenarios) if cfg.calc_stress or cfg.calc_var_es else []
    stress = run_stress_tests(portfolio, scenarios, limits=(limits_cfg or {}).get("stress") if limits_cfg else None) if cfg.calc_stress else None

    # 7 VaR/ES
    var_h = es_h = var_p = es_p = lc_var = None
    if cfg.calc_var_es and pnl_dist:
        var_h = historical_var(pnl_dist, cfg.alpha)
        es_h = historical_es(pnl_dist, cfg.alpha)
        var_p = parametric_var(pnl_dist, cfg.alpha)
        es_p = parametric_es(pnl_dist, cfg.alpha)
        lc_var = liquidity_adjusted_var(var_h, [abs(p.quantity) * p.liquidity_haircut for p in portfolio.positions])

    # 8 Лимиты
    limits = check_limits(
        {
            "var_hist": var_h if var_h is not None else 0.0,
            "es_hist": es_h if es_h is not None else 0.0,
            "var_param": var_p if var_p is not None else 0.0,
            "es_param": es_p if es_p is not None else 0.0,
            "lc_var": lc_var if lc_var is not None else 0.0,
        },
        limits_cfg or {},
    ) if limits_cfg else None

    # 5 buckets
    buckets = aggregate_buckets(portfolio, cfg.aggregations)

    # Корреляции
    corr = pnl_mat = None
    if pnl_dist:
        pnl_mat = pnl_matrix(portfolio, scenarios).tolist()
        corr = correlation_matrix(portfolio, scenarios).tolist() if len(scenarios) > 1 else None

    # 9 Маржа и капитал
    capital = initial_m = variation_m = None
    if cfg.calc_margin_capital:
        if var_h is not None and es_h is not None and lc_var is not None:
            capital = economic_capital(var_h, es_h)
            initial_m = initial_margin(lc_var)
        if pnl_dist:
            variation_m = variation_margin(pnl_dist[-1] if pnl_dist else 0.0)

    return CalculationResult(
        base_value=base_value,
        var_hist=var_h,
        es_hist=es_h,
        var_param=var_p,
        es_param=es_p,
        lc_var=lc_var,
        greeks=greeks,
        stress=stress,
        limits=limits,
        correlations=corr,
        pnl_matrix=pnl_mat,
        buckets=buckets,
        capital=capital,
        initial_margin=initial_m,
        variation_margin=variation_m,
        validation_log=validation_log,
    )

