import datetime as dt

import numpy as np

from option_risk.data.models import OptionPosition, OptionStyle, OptionType, Portfolio, MarketScenario
from option_risk.pricing import black_scholes, binomial_price, mc_price, implied_volatility
from option_risk.risk.portfolio import portfolio_value, scenario_pnl_distribution, greeks_summary
from option_risk.risk.var_es import historical_var, historical_es, parametric_var, parametric_es, liquidity_adjusted_var
from option_risk.risk.stress import run_stress_tests
from option_risk.risk.limits import check_limits
from option_risk.risk.correlations import pnl_matrix, correlation_matrix
from option_risk.risk.capital_margin import economic_capital, initial_margin
from option_risk.pricing.forward import price_forward
from option_risk.pricing.swap_ir import price_swap_ir


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


def test_black_scholes_price_matches_reference():
    position = make_position()
    price = black_scholes.price(position)
    assert np.isclose(price, 10.4506, atol=1e-3)


def test_binomial_converges_to_bs():
    position = make_position(style=OptionStyle.EUROPEAN)
    price_bs = black_scholes.price(position)
    price_binom = binomial_price(position, steps=400)
    assert np.isclose(price_binom, price_bs, atol=5e-2)


def test_monte_carlo_reasonable():
    position = make_position()
    price_mc = mc_price(position, n_paths=20_000, seed=7)
    price_bs = black_scholes.price(position)
    assert np.isclose(price_mc, price_bs, atol=2e-1)


def test_implied_volatility_roundtrip():
    position = make_position()
    market_price = black_scholes.price(position)
    iv = implied_volatility(position, market_price)
    assert np.isclose(iv, position.volatility, atol=1e-3)


def test_var_es_and_liquidity():
    portfolio = Portfolio(positions=[make_position(liquidity_haircut=0.2)])
    scenarios = [
        MarketScenario(scenario_id="down", underlying_shift=-0.05),
        MarketScenario(scenario_id="up", underlying_shift=0.05),
    ]
    pnls = scenario_pnl_distribution(portfolio, scenarios)
    var_h = historical_var(pnls, alpha=0.95)
    es_h = historical_es(pnls, alpha=0.95)
    var_p = parametric_var(pnls, alpha=0.95)
    es_p = parametric_es(pnls, alpha=0.95)
    lc_var = liquidity_adjusted_var(var_h, [abs(portfolio.positions[0].quantity) * 0.2])
    assert var_h >= 0
    assert es_h >= var_h
    assert var_p >= 0
    assert es_p >= 0
    assert lc_var >= var_h


def test_validation_rejects_negative_vol():
    try:
        make_position(volatility=-0.1)
        assert False, "Должно упасть из-за отрицательной волатильности"
    except Exception:
        pass


def test_stress_and_limits():
    portfolio = Portfolio(positions=[make_position(quantity=2)])
    scenarios = [
        MarketScenario(scenario_id="ok", underlying_shift=0.0, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="breach", underlying_shift=-0.5, volatility_shift=0.0, rate_shift=0.0),
    ]
    results = run_stress_tests(portfolio, scenarios, limits={"breach": 1.0})
    assert any(r.breached for r in results)


def test_limit_checks_table():
    limits = {"var_hist": 1000.0}
    metrics = {"var_hist": 1500.0}
    check = check_limits(metrics, limits)
    assert check and check[0][3] is True


def test_correlations_and_capital():
    portfolio = Portfolio(positions=[make_position(position_id="a"), make_position(position_id="b", strike=90)])
    scenarios = [
        MarketScenario(scenario_id="s1", underlying_shift=-0.02, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="s2", underlying_shift=0.02, volatility_shift=0.0, rate_shift=0.0),
    ]
    mat = pnl_matrix(portfolio, scenarios)
    corr = correlation_matrix(portfolio, scenarios)
    assert mat.shape == (2, 2)
    assert corr.shape == (2, 2)
    pnl = scenario_pnl_distribution(portfolio, scenarios)
    var_h = historical_var(pnl, 0.95)
    es_h = historical_es(pnl, 0.95)
    cap = economic_capital(var_h, es_h)
    assert cap >= var_h
    assert initial_margin(var_h) == var_h


def test_dv01_in_greeks():
    portfolio = Portfolio(positions=[make_position()])
    g = greeks_summary(portfolio)
    assert "dv01" in g


def test_forward_and_swap_pricing():
    fwd = make_position(instrument_type="forward", option_type=OptionType.CALL, strike=100, underlying_price=105, volatility=0.0)
    fwd_price = price_forward(fwd)
    assert fwd_price > 0
    swap = make_position(
        instrument_type="swap_ir",
        option_type=OptionType.CALL,
        strike=0.05,
        volatility=0.0,
        fixed_rate=0.05,
        float_rate=0.06,
        day_count=0.5,
    )
    swap_price = price_swap_ir(swap)
    assert swap_price > 0


def test_forward_delta_is_included():
    portfolio = Portfolio(positions=[make_position(instrument_type="forward", strike=100, underlying_price=105, volatility=0.0)])
    g = greeks_summary(portfolio)
    assert g["delta"] != 0


def test_swap_pricing_defaults_to_strike_and_risk_free_rate():
    swap = make_position(
        instrument_type="swap_ir",
        strike=0.05,
        volatility=0.0,
        fixed_rate=None,
        float_rate=None,
        day_count=0.5,
    )
    assert price_swap_ir(swap) == price_swap_ir(swap.copy(update={"fixed_rate": 0.05, "float_rate": swap.risk_free_rate}))
