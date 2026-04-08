"""Curve-based repricing для IRS/OIS/XCCY с fallback на упрощенную формулу."""
from __future__ import annotations

import datetime as dt
import math

from ..data.models import OptionPosition
from .calendar import build_overnight_compounding_segments, build_schedule_periods, joint_calendar_code
from .market import BasisCurve, DiscountCurve, FixingSeries, ForwardCurve, MarketDataContext


def _year_fraction(start_date: dt.date, end_date: dt.date, convention: str | None) -> float:
    convention_norm = (convention or "ACT/365").strip().upper()
    days = (end_date - start_date).days
    if convention_norm in {"ACT/360", "ACT360"}:
        return days / 360.0
    if convention_norm in {"30/360", "30E/360"}:
        d1 = min(start_date.day, 30)
        d2 = min(end_date.day, 30)
        months = end_date.month - start_date.month
        years = end_date.year - start_date.year
        return (360 * years + 30 * months + (d2 - d1)) / 360.0
    return days / 365.0


def _curve_df(curve: DiscountCurve | None, t: float, fallback_rate: float) -> float:
    if curve is not None:
        return curve.discount_factor(t)
    return math.exp(-fallback_rate * t)


def _curve_rate(curve: ForwardCurve | None, t: float, fallback_rate: float) -> float:
    if curve is not None:
        return curve.rate(t)
    return fallback_rate


def _is_overnight_compounded_leg(
    *,
    projection_curve_ref: str | None,
    fixing_index_ref: str | None,
    reset_convention: str | None,
) -> bool:
    if str(reset_convention or "").strip().lower() != "in_arrears":
        return False
    upper = f"{projection_curve_ref or ''} {fixing_index_ref or ''}".upper()
    if "OISFX" in upper or "OIS FX" in upper:
        return False
    if any(token in upper for token in ("RUONIA", "SOFR", "ESTR", "RUSFARCNY", "OIS", "O/N", "AVG", "COMP")):
        return True
    return "RUSFAR" in upper and "3M" not in upper and "CNY" not in upper


def _fixing_or_forward_rate(
    *,
    fixing_series: FixingSeries | None,
    projection_curve: ForwardCurve | None,
    fixing_date: dt.date,
    valuation_date: dt.date,
    fallback_rate: float,
) -> float:
    if fixing_series is not None:
        history_cutoff = min(valuation_date, fixing_series.latest_date())
        if fixing_date <= history_cutoff:
            realized = fixing_series.rate_on_or_before(fixing_date)
            if realized is not None:
                return realized
    fixing_t = max((fixing_date - valuation_date).days / 365.0, 0.0)
    return _curve_rate(projection_curve, fixing_t, fallback_rate)


def _compounded_coupon_return(
    *,
    period_start: dt.date,
    period_end: dt.date,
    fixing_calendar: str | None,
    fixing_days_lag: int | None,
    day_count_convention: str | None,
    valuation_date: dt.date,
    fixing_series: FixingSeries | None,
    projection_curve: ForwardCurve | None,
    spread: float,
    spread_curve: BasisCurve | None,
    spread_curve_sign: float,
    fallback_rate: float,
) -> float:
    compound_factor = 1.0
    for segment in build_overnight_compounding_segments(
        start_date=period_start,
        end_date=period_end,
        fixing_calendar=fixing_calendar,
        fixing_days_lag=fixing_days_lag or 0,
    ):
        accrual = _year_fraction(segment.accrual_start, segment.accrual_end, day_count_convention)
        segment_rate = _fixing_or_forward_rate(
            fixing_series=fixing_series,
            projection_curve=projection_curve,
            fixing_date=segment.fixing_date,
            valuation_date=valuation_date,
            fallback_rate=fallback_rate,
        )
        fixing_t = max((segment.fixing_date - valuation_date).days / 365.0, 0.0)
        curve_spread = spread_curve.spread(fixing_t) * spread_curve_sign if spread_curve is not None else 0.0
        compound_factor *= 1.0 + (segment_rate + spread + curve_spread) * accrual
    return compound_factor - 1.0


def _pv_leg(
    *,
    market: MarketDataContext,
    notional: float,
    fixed_rate: float | None,
    spread: float,
    spread_curve: BasisCurve | None,
    spread_curve_sign: float,
    projection_curve: ForwardCurve | None,
    projection_curve_ref: str | None,
    fixing_index_ref: str | None,
    discount_curve: DiscountCurve | None,
    start_date: dt.date,
    end_date: dt.date,
    valuation_date: dt.date,
    payment_frequency_months: int,
    schedule_calendar: str | None,
    fixing_calendar: str | None,
    business_day_convention: str | None,
    day_count_convention: str | None,
    reset_convention: str | None,
    fixing_days_lag: int | None,
    payment_lag_days: int | None,
    fallback_rate: float,
    exchange_principal: bool,
) -> float:
    periods = build_schedule_periods(
        start_date=start_date,
        end_date=end_date,
        frequency_months=payment_frequency_months,
        schedule_calendar=schedule_calendar,
        fixing_calendar=fixing_calendar,
        business_day_convention=business_day_convention,
        payment_lag_days=payment_lag_days or 0,
        fixing_days_lag=fixing_days_lag or 0,
        reset_convention=reset_convention,
    )
    fixing_series = market.get_fixing_series(ref=fixing_index_ref, projection_curve_ref=projection_curve_ref)
    is_overnight_compounded = fixed_rate is None and _is_overnight_compounded_leg(
        projection_curve_ref=projection_curve_ref or (projection_curve.name if projection_curve is not None else None),
        fixing_index_ref=fixing_index_ref,
        reset_convention=reset_convention,
    )
    pv = 0.0
    final_payment_date: dt.date | None = None
    for period in periods:
        final_payment_date = period.payment_date
        if period.payment_date <= valuation_date:
            continue
        payment_t = max((period.payment_date - valuation_date).days / 365.0, 0.0)
        if fixed_rate is not None:
            accrual = _year_fraction(period.accrual_start, period.accrual_end, day_count_convention)
            coupon_return = accrual * fixed_rate
        elif is_overnight_compounded:
            coupon_return = _compounded_coupon_return(
                period_start=period.accrual_start,
                period_end=period.accrual_end,
                fixing_calendar=fixing_calendar,
                fixing_days_lag=fixing_days_lag,
                day_count_convention=day_count_convention,
                valuation_date=valuation_date,
                fixing_series=fixing_series,
                projection_curve=projection_curve,
                spread=spread,
                spread_curve=spread_curve,
                spread_curve_sign=spread_curve_sign,
                fallback_rate=fallback_rate,
            )
        else:
            accrual = _year_fraction(period.accrual_start, period.accrual_end, day_count_convention)
            fixing_t = max((period.fixing_date - valuation_date).days / 365.0, 0.0)
            coupon_rate = _curve_rate(projection_curve, fixing_t, fallback_rate)
            curve_spread = spread_curve.spread(fixing_t) * spread_curve_sign if spread_curve is not None else 0.0
            coupon_return = accrual * (coupon_rate + spread + curve_spread)
        df = _curve_df(discount_curve, payment_t, fallback_rate)
        pv += notional * coupon_return * df
    if exchange_principal and final_payment_date is not None and final_payment_date > valuation_date:
        final_t = max((final_payment_date - valuation_date).days / 365.0, 0.0)
        pv += notional * _curve_df(discount_curve, final_t, fallback_rate)
    return pv


def _price_single_currency_swap(position: OptionPosition, market: MarketDataContext) -> float | None:
    currency = position.currency
    discount_curve = market.get_discount_curve(
        position.discount_curve_ref or position.receive_discount_curve_ref or position.pay_discount_curve_ref,
        currency=currency,
        collateral_currency=position.collateral_currency,
    )
    projection_curve = market.get_forward_curve(
        position.projection_curve_ref or position.receive_projection_curve_ref or position.pay_projection_curve_ref,
        currency=currency,
    )
    if discount_curve is None and projection_curve is None:
        return None

    start_date = position.effective_start_date()
    end_date = position.effective_end_date()
    fixed_rate = position.fixed_rate if position.fixed_rate is not None else position.strike
    fixed_freq = position.fixed_leg_frequency_months or 12
    float_freq = position.float_leg_frequency_months or fixed_freq
    schedule_calendar = position.pay_calendar or position.receive_calendar or currency
    fixing_calendar = position.pay_fixing_calendar or position.receive_fixing_calendar or schedule_calendar
    business_day_convention = (
        position.pay_business_day_convention or position.receive_business_day_convention or position.business_day_convention
    )
    reset_convention = position.pay_reset_convention or position.receive_reset_convention or position.reset_convention
    fixing_days_lag = (
        position.pay_fixing_days_lag
        if position.pay_fixing_days_lag is not None
        else position.receive_fixing_days_lag
        if position.receive_fixing_days_lag is not None
        else position.fixing_days_lag
    )
    payment_lag_days = (
        position.pay_payment_lag_days
        if position.pay_payment_lag_days is not None
        else position.receive_payment_lag_days
        if position.receive_payment_lag_days is not None
        else position.payment_lag_days
    )
    pv_fixed = _pv_leg(
        market=market,
        notional=position.notional,
        fixed_rate=fixed_rate,
        spread=0.0,
        spread_curve=None,
        spread_curve_sign=1.0,
        projection_curve=None,
        projection_curve_ref=None,
        fixing_index_ref=None,
        discount_curve=discount_curve,
        start_date=start_date,
        end_date=end_date,
        valuation_date=position.valuation_date,
        payment_frequency_months=fixed_freq,
        schedule_calendar=schedule_calendar,
        fixing_calendar=fixing_calendar,
        business_day_convention=business_day_convention,
        day_count_convention=position.day_count_convention,
        reset_convention=reset_convention,
        fixing_days_lag=fixing_days_lag,
        payment_lag_days=payment_lag_days,
        fallback_rate=position.risk_free_rate,
        exchange_principal=False,
    )
    pv_float = _pv_leg(
        market=market,
        notional=position.notional,
        fixed_rate=None,
        spread=position.float_spread,
        spread_curve=None,
        spread_curve_sign=1.0,
        projection_curve=projection_curve,
        projection_curve_ref=position.projection_curve_ref or position.receive_projection_curve_ref or position.pay_projection_curve_ref,
        fixing_index_ref=position.fixing_index_ref,
        discount_curve=discount_curve,
        start_date=start_date,
        end_date=end_date,
        valuation_date=position.valuation_date,
        payment_frequency_months=float_freq,
        schedule_calendar=schedule_calendar,
        fixing_calendar=fixing_calendar,
        business_day_convention=business_day_convention,
        day_count_convention=position.day_count_convention,
        reset_convention=reset_convention,
        fixing_days_lag=fixing_days_lag,
        payment_lag_days=payment_lag_days,
        fallback_rate=position.float_rate if position.float_rate is not None else position.risk_free_rate,
        exchange_principal=False,
    )
    return pv_float - pv_fixed


def _price_cross_currency_swap(position: OptionPosition, market: MarketDataContext) -> float | None:
    pay_currency = position.pay_currency
    receive_currency = position.receive_currency
    if not pay_currency or not receive_currency or pay_currency == receive_currency:
        return None

    pay_discount_curve = market.get_discount_curve(
        position.pay_discount_curve_ref,
        currency=pay_currency,
        collateral_currency=position.collateral_currency,
    )
    receive_discount_curve = market.get_discount_curve(
        position.receive_discount_curve_ref,
        currency=receive_currency,
        collateral_currency=position.collateral_currency,
    )
    if pay_discount_curve is None or receive_discount_curve is None:
        return None

    pay_projection_curve = market.get_forward_curve(position.pay_projection_curve_ref, currency=pay_currency)
    receive_projection_curve = market.get_forward_curve(position.receive_projection_curve_ref, currency=receive_currency)
    start_date = position.effective_start_date()
    end_date = position.effective_end_date()
    pay_notional = position.pay_leg_notional if position.pay_leg_notional is not None else position.notional
    receive_notional = position.receive_leg_notional if position.receive_leg_notional is not None else position.notional
    pay_freq = position.float_leg_frequency_months or 3
    receive_freq = position.fixed_leg_frequency_months or pay_freq
    default_schedule_calendar = joint_calendar_code(pay_currency, receive_currency)
    pay_schedule_calendar = position.pay_calendar or default_schedule_calendar
    receive_schedule_calendar = position.receive_calendar or default_schedule_calendar
    pay_fixing_calendar = position.pay_fixing_calendar or pay_currency
    receive_fixing_calendar = position.receive_fixing_calendar or receive_currency
    pay_bdc = position.pay_business_day_convention or position.business_day_convention
    receive_bdc = position.receive_business_day_convention or position.business_day_convention
    pay_day_count = position.pay_day_count_convention or position.day_count_convention
    receive_day_count = position.receive_day_count_convention or position.day_count_convention
    pay_fixing_lag = (
        position.pay_fixing_days_lag if position.pay_fixing_days_lag is not None else position.fixing_days_lag
    )
    receive_fixing_lag = (
        position.receive_fixing_days_lag if position.receive_fixing_days_lag is not None else position.fixing_days_lag
    )
    pay_payment_lag = (
        position.pay_payment_lag_days if position.pay_payment_lag_days is not None else position.payment_lag_days
    )
    receive_payment_lag = (
        position.receive_payment_lag_days if position.receive_payment_lag_days is not None else position.payment_lag_days
    )
    pay_reset_convention = position.pay_reset_convention or position.reset_convention
    receive_reset_convention = position.receive_reset_convention or position.reset_convention

    pay_fixed_rate = position.pay_fixed_rate
    receive_fixed_rate = position.receive_fixed_rate
    if pay_fixed_rate is None and position.fixed_rate is not None:
        pay_fixed_rate = position.fixed_rate

    pay_basis_curve: BasisCurve | None = None
    pay_basis_curve_sign = 1.0
    if (
        pay_fixed_rate is None
        and receive_fixed_rate is None
        and abs(position.pay_spread) < 1e-12
        and abs(position.receive_spread) < 1e-12
    ):
        direct_name = f"{pay_currency.upper()}/{receive_currency.upper()}:BASIS"
        inverse_name = f"{receive_currency.upper()}/{pay_currency.upper()}:BASIS"
        if direct_name in market.basis_curves:
            pay_basis_curve = market.basis_curves[direct_name]
        elif inverse_name in market.basis_curves:
            pay_basis_curve = market.basis_curves[inverse_name]
            pay_basis_curve_sign = -1.0

    pv_pay = _pv_leg(
        market=market,
        notional=pay_notional,
        fixed_rate=pay_fixed_rate,
        spread=position.pay_spread,
        spread_curve=pay_basis_curve,
        spread_curve_sign=pay_basis_curve_sign,
        projection_curve=pay_projection_curve,
        projection_curve_ref=position.pay_projection_curve_ref,
        fixing_index_ref=None,
        discount_curve=pay_discount_curve,
        start_date=start_date,
        end_date=end_date,
        valuation_date=position.valuation_date,
        payment_frequency_months=pay_freq,
        schedule_calendar=pay_schedule_calendar,
        fixing_calendar=pay_fixing_calendar,
        business_day_convention=pay_bdc,
        day_count_convention=pay_day_count,
        reset_convention=pay_reset_convention,
        fixing_days_lag=pay_fixing_lag,
        payment_lag_days=pay_payment_lag,
        fallback_rate=position.risk_free_rate,
        exchange_principal=position.exchange_principal,
    )
    pv_receive = _pv_leg(
        market=market,
        notional=receive_notional,
        fixed_rate=receive_fixed_rate,
        spread=position.receive_spread,
        spread_curve=None,
        spread_curve_sign=1.0,
        projection_curve=receive_projection_curve,
        projection_curve_ref=position.receive_projection_curve_ref,
        fixing_index_ref=None,
        discount_curve=receive_discount_curve,
        start_date=start_date,
        end_date=end_date,
        valuation_date=position.valuation_date,
        payment_frequency_months=receive_freq,
        schedule_calendar=receive_schedule_calendar,
        fixing_calendar=receive_fixing_calendar,
        business_day_convention=receive_bdc,
        day_count_convention=receive_day_count,
        reset_convention=receive_reset_convention,
        fixing_days_lag=receive_fixing_lag,
        payment_lag_days=receive_payment_lag,
        fallback_rate=position.float_rate if position.float_rate is not None else position.risk_free_rate,
        exchange_principal=position.exchange_principal,
    )

    result_currency = position.currency or receive_currency
    return (
        pv_receive * market.fx_rate(receive_currency, result_currency)
        - pv_pay * market.fx_rate(pay_currency, result_currency)
    )


def price_swap_ir(position: OptionPosition, market: MarketDataContext | None = None) -> float:
    if market is not None:
        xccy_value = _price_cross_currency_swap(position, market)
        if xccy_value is not None:
            return xccy_value
        curve_value = _price_single_currency_swap(position, market)
        if curve_value is not None:
            return curve_value

    fixed_rate = position.fixed_rate if position.fixed_rate is not None else position.strike
    float_rate = position.float_rate if position.float_rate is not None else position.risk_free_rate
    day_count = position.day_count or position.time_to_maturity()
    net_rate = (float_rate - fixed_rate) * day_count
    pv = position.notional * net_rate
    return pv * math.exp(-position.risk_free_rate * position.time_to_maturity())


__all__ = ["price_swap_ir"]
