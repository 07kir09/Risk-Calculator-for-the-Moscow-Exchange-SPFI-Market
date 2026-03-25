import datetime as dt
import math

import numpy as np
import pytest

from option_risk.data.models import MarketScenario, OptionPosition, OptionStyle, OptionType, Portfolio
from option_risk.pricing.calendar import build_schedule_periods
from option_risk.pricing.forward import price_forward
from option_risk.pricing.market import BasisCurve, DiscountCurve, FXForwardCurve, FixingSeries, ForwardCurve, MarketDataContext
from option_risk.pricing.swap_ir import price_swap_ir
from option_risk.risk.pipeline import CalculationConfig, run_calculation


def _flat_discount_curve(name: str, rate: float) -> DiscountCurve:
    tenors = np.asarray([0.5, 1.0, 2.0, 5.0], dtype=np.float64)
    dfs = np.exp(-rate * tenors)
    return DiscountCurve(name=name, as_of_date=dt.date(2025, 1, 1), tenor_years=tenors, discount_factors=dfs)


def _flat_forward_curve(name: str, rate: float) -> ForwardCurve:
    tenors = np.asarray([0.0, 0.5, 1.0, 2.0, 5.0], dtype=np.float64)
    rates = np.asarray([rate, rate, rate, rate, rate], dtype=np.float64)
    return ForwardCurve(name=name, as_of_date=dt.date(2025, 1, 1), tenor_years=tenors, forward_rates=rates)


def _market() -> MarketDataContext:
    return MarketDataContext(
        discount_curves={
            "USD-DISC": _flat_discount_curve("USD-DISC", 0.03),
            "RUB-DISC": _flat_discount_curve("RUB-DISC", 0.10),
        },
        forward_curves={
            "RUB-PROJ": _flat_forward_curve("RUB-PROJ", 0.10),
            "USD-PROJ": _flat_forward_curve("USD-PROJ", 0.03),
        },
        fx_spots={"USD": 90.0},
        base_currency="RUB",
    )


def _base_position(**kwargs) -> OptionPosition:
    base = dict(
        position_id="p1",
        instrument_type="forward",
        option_type=OptionType.CALL,
        style=OptionStyle.EUROPEAN,
        quantity=1,
        notional=1.0,
        underlying_symbol="USD/RUB",
        underlying_price=90.0,
        strike=92.0,
        volatility=0.0,
        maturity_date=dt.date(2026, 1, 1),
        valuation_date=dt.date(2025, 1, 1),
        risk_free_rate=0.1,
        dividend_yield=0.0,
        currency="RUB",
        liquidity_haircut=0.0,
    )
    base.update(kwargs)
    return OptionPosition(**base)


def _thirty_360(start_date: dt.date, end_date: dt.date) -> float:
    d1 = min(start_date.day, 30)
    d2 = min(end_date.day, 30)
    months = end_date.month - start_date.month
    years = end_date.year - start_date.year
    return (360 * years + 30 * months + (d2 - d1)) / 360.0


def _flat_df(rate: float, payment_date: dt.date, valuation_date: dt.date = dt.date(2025, 1, 1)) -> float:
    t = (payment_date - valuation_date).days / 365.0
    return math.exp(-rate * t)


def test_curve_based_fx_forward_uses_domestic_and_foreign_discount_curves():
    market = _market()
    position = _base_position(
        notional=1_000_000.0,
        pay_discount_curve_ref="RUB-DISC",
        receive_discount_curve_ref="USD-DISC",
    )

    price = price_forward(position, market=market)
    expected = 1_000_000.0 * (
        90.0 * math.exp(-0.03 * 1.0) - 92.0 * math.exp(-0.10 * 1.0)
    )

    assert price == pytest.approx(expected, rel=1e-9, abs=1e-9)


def test_curve_based_fx_forward_prefers_calibrated_fx_forward_curve():
    market = MarketDataContext(
        discount_curves=_market().discount_curves,
        forward_curves=_market().forward_curves,
        fx_spots={"USD": 90.0},
        fx_forward_curves={
            "USD/RUB": FXForwardCurve(
                name="USD/RUB",
                as_of_date=dt.date(2025, 1, 1),
                tenor_years=np.asarray([0.0, 1.0], dtype=np.float64),
                forward_prices=np.asarray([90.0, 95.0], dtype=np.float64),
            )
        },
        base_currency="RUB",
    )
    position = _base_position(
        notional=1_000_000.0,
        pay_discount_curve_ref="RUB-DISC",
        receive_discount_curve_ref="USD-DISC",
    )

    price = price_forward(position, market=market)
    expected = 1_000_000.0 * math.exp(-0.10 * 1.0) * (95.0 - 92.0)

    assert price == pytest.approx(expected, rel=1e-9, abs=1e-9)


def test_curve_based_fx_forward_uses_collateral_aware_discount_curve_fallback():
    market = MarketDataContext(
        discount_curves={
            "EUR-DISCOUNT-RUB-CSA": _flat_discount_curve("EUR-DISCOUNT-RUB-CSA", 0.02),
            "RUB-DISCOUNT-RUB-CSA": _flat_discount_curve("RUB-DISCOUNT-RUB-CSA", 0.10),
        },
        forward_curves={},
        fx_spots={"EUR": 100.0},
        base_currency="RUB",
    )
    position = _base_position(
        underlying_symbol="EUR/RUB",
        underlying_price=100.0,
        strike=102.0,
        notional=1_000_000.0,
        currency="RUB",
        collateral_currency="RUB",
        pay_discount_curve_ref=None,
        receive_discount_curve_ref=None,
    )

    price = price_forward(position, market=market)
    expected = 1_000_000.0 * (
        100.0 * math.exp(-0.02 * 1.0) - 102.0 * math.exp(-0.10 * 1.0)
    )

    assert price == pytest.approx(expected, rel=1e-9, abs=1e-9)


def test_curve_based_single_currency_swap_uses_schedule_and_projection_curve():
    market = _market()
    position = _base_position(
        instrument_type="swap_ir",
        underlying_symbol="RUBIRS",
        underlying_price=1.0,
        strike=0.12,
        fixed_rate=0.12,
        maturity_date=dt.date(2026, 1, 1),
        start_date=dt.date(2025, 1, 1),
        discount_curve_ref="RUB-DISC",
        projection_curve_ref="RUB-PROJ",
        day_count_convention="30/360",
        fixed_leg_frequency_months=6,
        float_leg_frequency_months=6,
        notional=100.0,
        currency="RUB",
    )

    price = price_swap_ir(position, market=market)
    periods = build_schedule_periods(
        start_date=dt.date(2025, 1, 1),
        end_date=dt.date(2026, 1, 1),
        frequency_months=6,
        schedule_calendar="RUB",
        fixing_calendar="RUB",
        business_day_convention="modified_following",
        payment_lag_days=0,
        fixing_days_lag=0,
        reset_convention="in_advance",
    )
    expected = 0.0
    for period in periods:
        accrual = _thirty_360(period.accrual_start, period.accrual_end)
        expected += 100.0 * accrual * (0.10 - 0.12) * _flat_df(0.10, period.payment_date)

    assert price == pytest.approx(expected, rel=1e-9, abs=1e-9)


def test_curve_based_xccy_swap_prices_receive_minus_pay_legs_with_fx_conversion():
    market = _market()
    position = _base_position(
        instrument_type="swap_ir",
        underlying_symbol="USD/RUB",
        underlying_price=1.0,
        strike=0.03,
        maturity_date=dt.date(2026, 1, 1),
        start_date=dt.date(2025, 1, 1),
        pay_currency="USD",
        receive_currency="RUB",
        pay_leg_notional=1_000_000.0,
        receive_leg_notional=90_000_000.0,
        pay_discount_curve_ref="USD-DISC",
        receive_discount_curve_ref="RUB-DISC",
        pay_fixed_rate=0.03,
        receive_fixed_rate=0.12,
        fixed_leg_frequency_months=12,
        float_leg_frequency_months=12,
        day_count_convention="30/360",
        exchange_principal=True,
        currency="RUB",
    )

    price = price_swap_ir(position, market=market)
    periods = build_schedule_periods(
        start_date=dt.date(2025, 1, 1),
        end_date=dt.date(2026, 1, 1),
        frequency_months=12,
        schedule_calendar="RUB+USD",
        fixing_calendar="USD",
        business_day_convention="modified_following",
        payment_lag_days=0,
        fixing_days_lag=0,
        reset_convention="in_advance",
    )
    period = periods[-1]
    accrual = _thirty_360(period.accrual_start, period.accrual_end)
    expected_receive = 90_000_000.0 * (accrual * 0.12 + 1.0) * _flat_df(0.10, period.payment_date)
    expected_pay = 1_000_000.0 * (accrual * 0.03 + 1.0) * _flat_df(0.03, period.payment_date) * 90.0

    assert price == pytest.approx(expected_receive - expected_pay, rel=1e-9, abs=1e-6)


def test_curve_based_basis_swap_uses_market_basis_curve_for_floating_legs():
    market = MarketDataContext(
        discount_curves=_market().discount_curves,
        forward_curves=_market().forward_curves,
        fx_spots={"USD": 90.0},
        basis_curves={
            "USD/RUB:BASIS": BasisCurve(
                name="USD/RUB:BASIS",
                as_of_date=dt.date(2025, 1, 1),
                tenor_years=np.asarray([0.0, 1.0], dtype=np.float64),
                spreads=np.asarray([0.01, 0.01], dtype=np.float64),
            )
        },
        base_currency="RUB",
    )
    position = _base_position(
        instrument_type="swap_ir",
        underlying_symbol="USD/RUB",
        underlying_price=1.0,
        maturity_date=dt.date(2026, 1, 1),
        start_date=dt.date(2025, 1, 1),
        pay_currency="USD",
        receive_currency="RUB",
        pay_leg_notional=1_000_000.0,
        receive_leg_notional=90_000_000.0,
        pay_discount_curve_ref="USD-DISC",
        receive_discount_curve_ref="RUB-DISC",
        pay_projection_curve_ref="USD-PROJ",
        receive_projection_curve_ref="RUB-PROJ",
        pay_fixed_rate=None,
        receive_fixed_rate=None,
        pay_spread=0.0,
        receive_spread=0.0,
        fixed_leg_frequency_months=12,
        float_leg_frequency_months=12,
        day_count_convention="30/360",
        exchange_principal=False,
        currency="RUB",
    )

    price = price_swap_ir(position, market=market)
    periods = build_schedule_periods(
        start_date=dt.date(2025, 1, 1),
        end_date=dt.date(2026, 1, 1),
        frequency_months=12,
        schedule_calendar="RUB+USD",
        fixing_calendar="USD",
        business_day_convention="modified_following",
        payment_lag_days=0,
        fixing_days_lag=0,
        reset_convention="in_advance",
    )
    period = periods[-1]
    accrual = _thirty_360(period.accrual_start, period.accrual_end)
    expected_receive = 90_000_000.0 * accrual * 0.10 * _flat_df(0.10, period.payment_date)
    expected_pay = 1_000_000.0 * accrual * (0.03 + 0.01) * _flat_df(0.03, period.payment_date) * 90.0

    assert price == pytest.approx(expected_receive - expected_pay, rel=1e-9, abs=1e-6)


def test_curve_based_ois_coupon_uses_fixings_history_and_daily_business_day_compounding():
    market = MarketDataContext(
        discount_curves={"USD-DISC": _flat_discount_curve("USD-DISC", 0.03)},
        forward_curves={"USD-SOFR": _flat_forward_curve("USD-SOFR", 0.04)},
        fx_spots={"USD": 1.0},
        fixing_series={
            "SOFR Comp.": FixingSeries(
                name="SOFR Comp.",
                dates=(dt.date(2026, 1, 5), dt.date(2026, 1, 6)),
                rates=np.asarray([0.031, 0.032], dtype=np.float64),
            ),
            "USD_SOFR": FixingSeries(
                name="SOFR Comp.",
                dates=(dt.date(2026, 1, 5), dt.date(2026, 1, 6)),
                rates=np.asarray([0.031, 0.032], dtype=np.float64),
            ),
        },
        base_currency="USD",
    )
    position = _base_position(
        instrument_type="swap_ir",
        underlying_symbol="USDOIS",
        underlying_price=1.0,
        strike=0.01,
        fixed_rate=0.0,
        maturity_date=dt.date(2026, 1, 12),
        valuation_date=dt.date(2026, 1, 8),
        start_date=dt.date(2026, 1, 5),
        discount_curve_ref="USD-DISC",
        projection_curve_ref="USD-SOFR",
        fixing_index_ref="SOFR Comp.",
        day_count_convention="ACT/360",
        fixed_leg_frequency_months=1,
        float_leg_frequency_months=1,
        reset_convention="in_arrears",
        business_day_convention="modified_following",
        fixing_days_lag=0,
        notional=1_000_000.0,
        currency="USD",
    )

    price = price_swap_ir(position, market=market)
    compounded_coupon = (
        (1.0 + 0.031 * (1.0 / 360.0))
        * (1.0 + 0.032 * (1.0 / 360.0))
        * (1.0 + 0.04 * (1.0 / 360.0))
        * (1.0 + 0.04 * (1.0 / 360.0))
        * (1.0 + 0.04 * (3.0 / 360.0))
        - 1.0
    )
    expected = 1_000_000.0 * compounded_coupon * _flat_df(0.03, dt.date(2026, 1, 12), dt.date(2026, 1, 8))

    assert price == pytest.approx(expected, rel=1e-9, abs=1e-9)


def test_run_calculation_uses_curve_shocks_for_curve_priced_forward():
    market = _market()
    position = _base_position(
        notional=1_000_000.0,
        pay_discount_curve_ref="RUB-DISC",
        receive_discount_curve_ref="USD-DISC",
    )
    portfolio = Portfolio(positions=[position])
    scenarios = [
        MarketScenario(scenario_id="base", underlying_shift=0.0, volatility_shift=0.0, rate_shift=0.0),
        MarketScenario(
            scenario_id="rub_curve_up",
            underlying_shift=0.0,
            volatility_shift=0.0,
            rate_shift=0.0,
            curve_shifts={"RUB-DISC": 0.01},
        ),
    ]
    cfg = CalculationConfig(
        calc_sensitivities=False,
        calc_var_es=True,
        calc_stress=True,
        calc_margin_capital=False,
        calc_correlations=False,
        alpha=0.5,
    )

    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg, market=market)

    assert result.pnl_distribution is not None
    assert result.pnl_distribution[0] == pytest.approx(0.0, abs=1e-9)
    assert result.pnl_distribution[1] > 0.0
    assert result.stress is not None and result.stress[1].pnl > 0.0
