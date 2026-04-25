import math

import pytest

from option_risk.data.models import MarketScenario, OptionPosition, Portfolio
from option_risk.risk.pipeline import CalculationConfig, run_calculation


FX_RATES = {"USD": 90.0, "EUR": 100.0}


def _forward(
    position_id: str,
    *,
    currency: str,
    quantity: float,
    notional: float,
    underlying_price: float,
    strike: float,
) -> OptionPosition:
    return OptionPosition(
        instrument_type="forward",
        position_id=position_id,
        option_type="call",
        style="european",
        quantity=quantity,
        notional=notional,
        underlying_symbol=position_id.upper(),
        underlying_price=underlying_price,
        strike=strike,
        volatility=0.0,
        maturity_date="2027-01-01",
        valuation_date="2026-01-01",
        risk_free_rate=0.0,
        dividend_yield=0.0,
        currency=currency,
        liquidity_haircut=0.0,
    )


def _rub_fx(currency: str) -> float:
    if currency == "RUB":
        return 1.0
    return FX_RATES[currency]


def _manual_forward_value(position: OptionPosition, *, underlying_price: float, rate: float) -> float:
    tenor_years = (position.maturity_date - position.valuation_date).days / 365.0
    discount_factor = math.exp(-rate * tenor_years)
    return position.quantity * position.notional * (underlying_price - position.strike) * discount_factor


def _manual_position_pnl_rub(position: OptionPosition, scenario: MarketScenario) -> float:
    base_local = _manual_forward_value(
        position,
        underlying_price=position.underlying_price,
        rate=position.risk_free_rate,
    )
    stressed_local = _manual_forward_value(
        position,
        underlying_price=position.underlying_price * (1.0 + scenario.underlying_shift),
        rate=position.risk_free_rate + scenario.rate_shift,
    )
    return (stressed_local - base_local) * _rub_fx(position.currency)


def _manual_historical_var_es(pnls: list[float], alpha: float) -> tuple[float, float]:
    sorted_pnls = sorted(pnls)
    tail_count = max(1, math.ceil(len(sorted_pnls) * (1.0 - alpha) - 1e-12))
    tail = sorted_pnls[:tail_count]
    return max(0.0, -tail[-1]), max(0.0, -sum(tail) / len(tail))


def test_manual_small_rub_usd_eur_forward_portfolio_matches_run_calculation():
    portfolio = Portfolio(
        positions=[
            _forward(
                "rub_forward",
                currency="RUB",
                quantity=2.0,
                notional=10.0,
                underlying_price=100.0,
                strike=95.0,
            ),
            _forward(
                "usd_forward",
                currency="USD",
                quantity=1.0,
                notional=5.0,
                underlying_price=50.0,
                strike=48.0,
            ),
            _forward(
                "eur_forward",
                currency="EUR",
                quantity=3.0,
                notional=2.0,
                underlying_price=80.0,
                strike=75.0,
            ),
        ]
    )
    scenarios = [
        MarketScenario(scenario_id="base", underlying_shift=0.0, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="up", underlying_shift=0.10, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="down", underlying_shift=-0.05, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="worst", underlying_shift=-0.20, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(scenario_id="mild", underlying_shift=0.02, volatility_shift=0.0, rate_shift=0.0),
    ]
    cfg = CalculationConfig(
        base_currency="RUB",
        fx_rates=FX_RATES,
        alpha=0.80,
        horizon_days=1,
        mode="api",
        calc_sensitivities=False,
        calc_var_es=True,
        calc_stress=True,
        calc_margin_capital=True,
        calc_correlations=False,
    )

    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)

    expected_base_value = sum(
        _manual_forward_value(
            position,
            underlying_price=position.underlying_price,
            rate=position.risk_free_rate,
        )
        * _rub_fx(position.currency)
        for position in portfolio.positions
    )
    expected_pnl_matrix = [
        [_manual_position_pnl_rub(position, scenario) for scenario in scenarios]
        for position in portfolio.positions
    ]
    expected_pnls = [sum(row[idx] for row in expected_pnl_matrix) for idx in range(len(scenarios))]
    expected_var, expected_es = _manual_historical_var_es(expected_pnls, cfg.alpha)

    assert expected_base_value == pytest.approx(4000.0)
    assert expected_pnls == pytest.approx([0.0, 7250.0, -3625.0, -14500.0, 1450.0])
    assert result.base_value == pytest.approx(expected_base_value, rel=1e-12, abs=1e-9)
    assert result.pnl_matrix is not None
    assert len(result.pnl_matrix) == len(expected_pnl_matrix)
    for actual_row, expected_row in zip(result.pnl_matrix, expected_pnl_matrix):
        assert actual_row == pytest.approx(expected_row, rel=1e-12, abs=1e-9)
    assert result.pnl_distribution == pytest.approx(expected_pnls, rel=1e-12, abs=1e-9)
    assert [row.pnl for row in result.stress] == pytest.approx(expected_pnls, rel=1e-12, abs=1e-9)
    assert result.var_hist == pytest.approx(expected_var, rel=1e-12, abs=1e-9)
    assert result.es_hist == pytest.approx(expected_es, rel=1e-12, abs=1e-9)
    assert result.lc_var == pytest.approx(expected_var, rel=1e-12, abs=1e-9)
    assert result.capital == pytest.approx(expected_es, rel=1e-12, abs=1e-9)
    assert result.initial_margin == pytest.approx(expected_var, rel=1e-12, abs=1e-9)
    assert result.variation_margin == pytest.approx(0.0)
    assert result.fx_warning is None
