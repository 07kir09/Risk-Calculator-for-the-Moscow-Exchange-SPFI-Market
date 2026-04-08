import datetime as dt

import numpy as np
import pytest

from option_risk.data.models import MarketScenario, OptionPosition, OptionStyle, OptionType, Portfolio
from option_risk.risk.limits import check_limits
from option_risk.risk.pipeline import CalculationConfig, run_calculation
from option_risk.risk.correlations import correlation_matrix
from option_risk.risk.var_es import historical_var
from option_risk.pricing import mc_price


def make_position(**kwargs) -> OptionPosition:
    base = dict(
        position_id="test",
        instrument_type="option",
        option_type=OptionType.CALL,
        style=OptionStyle.EUROPEAN,
        quantity=1,
        notional=1.0,
        underlying_symbol="TEST",
        underlying_price=100.0,
        strike=100.0,
        volatility=0.2,
        maturity_date=dt.date(2026, 1, 1),
        valuation_date=dt.date(2025, 1, 1),
        risk_free_rate=0.05,
        dividend_yield=0.0,
        currency="RUB",
    )
    base.update(kwargs)
    return OptionPosition(**base)


def test_check_limits_var_breaches_when_above_limit():
    limits = {"var_hist": 1000.0}
    metrics = {"var_hist": 1200.0}
    res = check_limits(metrics, limits)
    assert res == [("var_hist", 1200.0, 1000.0, True)]


def test_check_limits_pnl_breaches_when_below_minus_limit():
    limits = {"daily_pnl": 1000.0}
    metrics = {"daily_pnl": -1500.0}
    res = check_limits(metrics, limits)
    assert res == [("daily_pnl", -1500.0, 1000.0, True)]


def test_run_calculation_end_to_end():
    portfolio = Portfolio(positions=[make_position(position_id="a"), make_position(position_id="b", strike=90)])
    scenarios = [
        MarketScenario(scenario_id="s1", underlying_shift=-0.05, volatility_shift=0.1, rate_shift=0.0),
        MarketScenario(scenario_id="s2", underlying_shift=0.03, volatility_shift=-0.05, rate_shift=0.0005),
        MarketScenario(scenario_id="s3", underlying_shift=0.0, volatility_shift=0.0, rate_shift=-0.0005),
    ]
    limits_cfg = {"var_hist": 1.0, "stress": {"s1": 1.0}}
    cfg = CalculationConfig(calc_sensitivities=True, calc_var_es=True, calc_stress=True, calc_margin_capital=True, alpha=0.95)
    result = run_calculation(portfolio, scenarios, limits_cfg=limits_cfg, config=cfg)

    assert np.isfinite(result.base_value)
    assert result.greeks is not None
    assert "dv01" in result.greeks
    assert result.stress is not None and len(result.stress) == len(scenarios)
    assert result.var_hist is not None and result.var_hist >= 0
    assert result.es_hist is not None and result.es_hist >= result.var_hist
    assert result.lc_var is not None and result.lc_var >= result.var_hist
    assert result.limits is not None
    assert result.initial_margin is not None


def test_run_calculation_respects_flags():
    portfolio = Portfolio(positions=[make_position()])
    scenarios = [MarketScenario(scenario_id="s1", underlying_shift=0.0, volatility_shift=0.0, rate_shift=0.0)]
    cfg = CalculationConfig(calc_sensitivities=False, calc_var_es=False, calc_stress=False, calc_margin_capital=False)
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)
    assert result.greeks is None
    assert result.var_hist is None
    assert result.es_hist is None
    assert result.stress is None
    assert result.capital is None


def test_correlation_matrix_requires_two_scenarios():
    portfolio = Portfolio(positions=[make_position(position_id="a"), make_position(position_id="b", strike=90)])
    scenarios = [MarketScenario(scenario_id="only", underlying_shift=0.01, volatility_shift=0.0, rate_shift=0.0)]
    with pytest.raises(ValueError):
        correlation_matrix(portfolio, scenarios)


def test_monte_carlo_is_deterministic_with_seed():
    position = make_position()
    p1 = mc_price(position, n_paths=5000, seed=123)
    p2 = mc_price(position, n_paths=5000, seed=123)
    assert p1 == p2


def test_run_calculation_sanitizes_nan_correlations():
    portfolio = Portfolio(
        positions=[
            make_position(
                position_id="f1",
                instrument_type="forward",
                volatility=0.0,
                underlying_price=100.0,
                strike=100.0,
                notional=1.0,
            ),
            make_position(
                position_id="f2",
                instrument_type="forward",
                volatility=0.0,
                underlying_price=100.0,
                strike=100.0,
                notional=1.0,
            ),
        ]
    )
    scenarios = [
        MarketScenario(scenario_id="s1", underlying_shift=0.0, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="s2", underlying_shift=0.0, volatility_shift=0.0, rate_shift=0.0),
    ]
    cfg = CalculationConfig(calc_sensitivities=True, calc_var_es=True, calc_stress=True, calc_margin_capital=True, alpha=0.99)
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)

    assert result.correlations is not None
    corr = np.asarray(result.correlations, dtype=np.float64)
    assert np.isfinite(corr).all()
    assert np.allclose(np.diag(corr), 1.0)
    assert any("корреляц" in msg.message.lower() for msg in result.validation_log)


def test_run_calculation_skips_correlations_when_disabled():
    portfolio = Portfolio(positions=[make_position(position_id="a"), make_position(position_id="b", strike=95)])
    scenarios = [
        MarketScenario(scenario_id="s1", underlying_shift=-0.01, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="s2", underlying_shift=0.01, volatility_shift=0.0, rate_shift=0.0),
    ]
    cfg = CalculationConfig(calc_sensitivities=True, calc_var_es=True, calc_stress=True, calc_margin_capital=True, calc_correlations=False)
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)

    assert result.correlations is None


def test_run_calculation_skips_correlations_when_position_count_exceeds_limit():
    positions = [
        make_position(
            position_id=f"f{i}",
            instrument_type="forward",
            volatility=0.0,
            underlying_price=100.0 + (i % 3),
            strike=100.0,
            notional=1.0,
        )
        for i in range(6)
    ]
    portfolio = Portfolio(positions=positions)
    scenarios = [
        MarketScenario(scenario_id="s1", underlying_shift=-0.01, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="s2", underlying_shift=0.01, volatility_shift=0.0, rate_shift=0.0),
    ]
    cfg = CalculationConfig(
        calc_sensitivities=False,
        calc_var_es=True,
        calc_stress=False,
        calc_margin_capital=False,
        calc_correlations=True,
        max_correlation_positions=4,
    )
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)

    assert result.correlations is None
    assert any("корреляц" in msg.message.lower() and "пропущен" in msg.message.lower() for msg in result.validation_log)


def test_run_calculation_truncates_lc_breakdown_rows():
    portfolio = Portfolio(
        positions=[
            make_position(position_id=f"p{i}", liquidity_haircut=0.5 + i * 0.1, notional=100.0 + i * 10.0)
            for i in range(8)
        ]
    )
    scenarios = [MarketScenario(scenario_id="s1", underlying_shift=-0.02, volatility_shift=0.0, rate_shift=0.0)]
    cfg = CalculationConfig(
        calc_sensitivities=False,
        calc_var_es=True,
        calc_stress=False,
        calc_margin_capital=False,
        max_lc_breakdown_rows=3,
    )
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)

    assert result.lc_var_breakdown is not None
    assert len(result.lc_var_breakdown) == 3
    assert any("breakdown" in msg.message.lower() and "top-3" in msg.message.lower() for msg in result.validation_log)


def test_run_calculation_omits_large_pnl_matrix_from_response():
    portfolio = Portfolio(
        positions=[
            make_position(
                position_id=f"f{i}",
                instrument_type="forward",
                volatility=0.0,
                underlying_price=100.0 + i,
                strike=100.0,
                notional=1.0,
            )
            for i in range(6)
        ]
    )
    scenarios = [
        MarketScenario(scenario_id="s1", underlying_shift=-0.01, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="s2", underlying_shift=0.0, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="s3", underlying_shift=0.01, volatility_shift=0.0, rate_shift=0.0),
    ]
    cfg = CalculationConfig(
        calc_sensitivities=False,
        calc_var_es=True,
        calc_stress=False,
        calc_margin_capital=False,
        max_pnl_matrix_cells=10,
    )
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)

    assert result.pnl_matrix is None
    assert any("pnl_matrix" in msg.message.lower() for msg in result.validation_log)


def test_run_calculation_uses_weighted_historical_var_when_probabilities_provided():
    portfolio = Portfolio(
        positions=[
            make_position(
                instrument_type="forward",
                volatility=0.0,
                underlying_price=100.0,
                strike=100.0,
                notional=1.0,
            )
        ]
    )
    scenarios = [
        MarketScenario(
            scenario_id="rare_crash",
            underlying_shift=-0.5,
            volatility_shift=0.0,
            rate_shift=0.0,
            probability=0.01,
        ),
        MarketScenario(
            scenario_id="common_move",
            underlying_shift=-0.01,
            volatility_shift=0.0,
            rate_shift=0.0,
            probability=0.99,
        ),
    ]
    cfg = CalculationConfig(
        calc_sensitivities=False,
        calc_var_es=True,
        calc_stress=False,
        calc_margin_capital=False,
        calc_correlations=False,
        alpha=0.95,
    )
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)

    assert result.pnl_distribution is not None
    unweighted_var = historical_var(result.pnl_distribution, alpha=0.95)
    assert result.var_hist is not None
    assert result.var_hist < unweighted_var
