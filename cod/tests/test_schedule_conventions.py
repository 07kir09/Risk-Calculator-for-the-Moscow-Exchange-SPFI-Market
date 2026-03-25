import datetime as dt

from option_risk.pricing.calendar import adjust_date, build_overnight_compounding_segments, build_schedule_periods


def test_modified_following_respects_month_boundary():
    adjusted = adjust_date(dt.date(2026, 5, 31), "TARGET", "modified_following")
    assert adjusted == dt.date(2026, 5, 29)


def test_schedule_generation_uses_business_days_payment_lag_and_in_advance_reset():
    periods = build_schedule_periods(
        start_date=dt.date(2026, 7, 3),
        end_date=dt.date(2026, 8, 3),
        frequency_months=1,
        schedule_calendar="USD",
        fixing_calendar="USD",
        business_day_convention="modified_following",
        payment_lag_days=2,
        fixing_days_lag=2,
        reset_convention="in_advance",
    )

    assert len(periods) == 1
    assert periods[0].accrual_start == dt.date(2026, 7, 6)
    assert periods[0].accrual_end == dt.date(2026, 8, 3)
    assert periods[0].payment_date == dt.date(2026, 8, 5)
    assert periods[0].fixing_date == dt.date(2026, 7, 1)


def test_schedule_generation_supports_in_arrears_fixing():
    periods = build_schedule_periods(
        start_date=dt.date(2026, 6, 30),
        end_date=dt.date(2026, 9, 30),
        frequency_months=3,
        schedule_calendar="RUB+CNY",
        fixing_calendar="RUB",
        business_day_convention="modified_following",
        payment_lag_days=0,
        fixing_days_lag=0,
        reset_convention="in_arrears",
    )

    assert len(periods) == 1
    assert periods[0].accrual_end == periods[0].fixing_date


def test_overnight_compounding_segments_follow_business_day_steps_and_weekend_stub():
    segments = build_overnight_compounding_segments(
        start_date=dt.date(2026, 1, 5),
        end_date=dt.date(2026, 1, 12),
        fixing_calendar="USD",
        fixing_days_lag=0,
    )

    assert [(segment.accrual_start, segment.accrual_end) for segment in segments] == [
        (dt.date(2026, 1, 5), dt.date(2026, 1, 6)),
        (dt.date(2026, 1, 6), dt.date(2026, 1, 7)),
        (dt.date(2026, 1, 7), dt.date(2026, 1, 8)),
        (dt.date(2026, 1, 8), dt.date(2026, 1, 9)),
        (dt.date(2026, 1, 9), dt.date(2026, 1, 12)),
    ]
    assert [segment.fixing_date for segment in segments] == [
        dt.date(2026, 1, 5),
        dt.date(2026, 1, 6),
        dt.date(2026, 1, 7),
        dt.date(2026, 1, 8),
        dt.date(2026, 1, 9),
    ]
