"""Business-day calendars and schedule generation for rates/XCCY cashflows."""
from __future__ import annotations

import calendar
import datetime as dt
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable, Tuple


_VALID_BDC = {"following", "modified_following", "preceding", "modified_preceding", "unadjusted"}
_VALID_RESET = {"in_advance", "in_arrears"}

_CNY_SPRING_FESTIVAL = {
    2025: ((1, 28), (2, 4)),
    2026: ((2, 17), (2, 23)),
    2027: ((2, 6), (2, 12)),
    2028: ((1, 26), (2, 1)),
}


@dataclass(frozen=True)
class SchedulePeriod:
    accrual_start: dt.date
    accrual_end: dt.date
    payment_date: dt.date
    fixing_date: dt.date


@dataclass(frozen=True)
class OvernightCompoundingSegment:
    accrual_start: dt.date
    accrual_end: dt.date
    fixing_date: dt.date


def normalize_business_day_convention(value: str | None, *, default: str = "modified_following") -> str:
    text = str(value or default).strip().lower()
    aliases = {
        "mf": "modified_following",
        "mod_following": "modified_following",
        "modfollowing": "modified_following",
        "mp": "modified_preceding",
        "mod_preceding": "modified_preceding",
        "modpreceding": "modified_preceding",
        "f": "following",
        "p": "preceding",
    }
    text = aliases.get(text, text)
    if text not in _VALID_BDC:
        return default
    return text


def normalize_reset_convention(value: str | None, *, default: str = "in_advance") -> str:
    text = str(value or default).strip().lower()
    aliases = {
        "advance": "in_advance",
        "arrears": "in_arrears",
        "inadvance": "in_advance",
        "inarrears": "in_arrears",
    }
    text = aliases.get(text, text)
    if text not in _VALID_RESET:
        return default
    return text


def normalize_calendar_code(value: str | None, *, default_currency: str | None = None) -> str:
    raw = str(value or default_currency or "RUB").strip().upper()
    if not raw:
        raw = "RUB"
    parts = [part.strip().upper() for part in raw.replace(",", "+").split("+") if part.strip()]
    normalized: list[str] = []
    aliases = {
        "EUR": "TARGET",
        "EURO": "TARGET",
        "TARGET2": "TARGET",
        "US": "USD",
        "CNH": "CNY",
        "CNSH": "CNY",
        "RUSSIA": "RUB",
        "UNITEDSTATES": "USD",
    }
    for part in parts:
        normalized.append(aliases.get(part, part))
    unique = sorted(dict.fromkeys(normalized))
    return "+".join(unique) if unique else "RUB"


def joint_calendar_code(*values: str | None) -> str:
    parts: list[str] = []
    for value in values:
        normalized = normalize_calendar_code(value)
        parts.extend(part for part in normalized.split("+") if part)
    return "+".join(sorted(dict.fromkeys(parts))) if parts else "RUB"


def _observed_fixed_holiday(year: int, month: int, day: int) -> dt.date:
    holiday = dt.date(year, month, day)
    if holiday.weekday() == 5:
        return holiday - dt.timedelta(days=1)
    if holiday.weekday() == 6:
        return holiday + dt.timedelta(days=1)
    return holiday


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> dt.date:
    first = dt.date(year, month, 1)
    delta = (weekday - first.weekday()) % 7
    return first + dt.timedelta(days=delta + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> dt.date:
    last_day = calendar.monthrange(year, month)[1]
    value = dt.date(year, month, last_day)
    delta = (value.weekday() - weekday) % 7
    return value - dt.timedelta(days=delta)


def _easter_sunday(year: int) -> dt.date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return dt.date(year, month, day)


@lru_cache(maxsize=None)
def _usd_holidays(year: int) -> frozenset[dt.date]:
    return frozenset(
        {
            _observed_fixed_holiday(year, 1, 1),
            _nth_weekday(year, 1, 0, 3),   # MLK Day
            _nth_weekday(year, 2, 0, 3),   # Presidents Day
            _last_weekday(year, 5, 0),     # Memorial Day
            _observed_fixed_holiday(year, 6, 19),
            _observed_fixed_holiday(year, 7, 4),
            _nth_weekday(year, 9, 0, 1),   # Labor Day
            _nth_weekday(year, 10, 0, 2),  # Columbus Day
            _observed_fixed_holiday(year, 11, 11),
            _nth_weekday(year, 11, 3, 4),  # Thanksgiving
            _observed_fixed_holiday(year, 12, 25),
        }
    )


@lru_cache(maxsize=None)
def _target_holidays(year: int) -> frozenset[dt.date]:
    easter = _easter_sunday(year)
    return frozenset(
        {
            dt.date(year, 1, 1),
            easter - dt.timedelta(days=2),  # Good Friday
            easter + dt.timedelta(days=1),  # Easter Monday
            dt.date(year, 5, 1),
            dt.date(year, 12, 25),
            dt.date(year, 12, 26),
        }
    )


@lru_cache(maxsize=None)
def _rub_holidays(year: int) -> frozenset[dt.date]:
    holidays = {dt.date(year, 1, day) for day in range(1, 9)}
    for month, day in ((2, 23), (3, 8), (5, 1), (5, 9), (6, 12), (11, 4)):
        holidays.add(_observed_fixed_holiday(year, month, day))
    return frozenset(holidays)


@lru_cache(maxsize=None)
def _cny_holidays(year: int) -> frozenset[dt.date]:
    holidays = {dt.date(year, 1, 1)}
    for day in range(1, 8):
        holidays.add(dt.date(year, 10, day))
    spring = _CNY_SPRING_FESTIVAL.get(year)
    if spring is not None:
        start = dt.date(year, spring[0][0], spring[0][1])
        end = dt.date(year, spring[1][0], spring[1][1])
        cursor = start
        while cursor <= end:
            holidays.add(cursor)
            cursor += dt.timedelta(days=1)
    return frozenset(holidays)


def _calendar_holidays(code: str, year: int) -> frozenset[dt.date]:
    if code == "USD":
        return _usd_holidays(year)
    if code == "TARGET":
        return _target_holidays(year)
    if code == "RUB":
        return _rub_holidays(year)
    if code == "CNY":
        return _cny_holidays(year)
    return frozenset()


def is_business_day(value: dt.date, calendar_code: str | None) -> bool:
    code = normalize_calendar_code(calendar_code)
    if value.weekday() >= 5:
        return False
    for part in code.split("+"):
        if value in _calendar_holidays(part, value.year):
            return False
    return True


def adjust_date(value: dt.date, calendar_code: str | None, convention: str | None = None) -> dt.date:
    bdc = normalize_business_day_convention(convention)
    if bdc == "unadjusted":
        return value
    code = normalize_calendar_code(calendar_code)
    if is_business_day(value, code):
        return value

    if bdc in {"following", "modified_following"}:
        cursor = value
        while not is_business_day(cursor, code):
            cursor += dt.timedelta(days=1)
        if bdc == "modified_following" and cursor.month != value.month:
            return adjust_date(value, code, "preceding")
        return cursor

    cursor = value
    while not is_business_day(cursor, code):
        cursor -= dt.timedelta(days=1)
    if bdc == "modified_preceding" and cursor.month != value.month:
        return adjust_date(value, code, "following")
    return cursor


def shift_business_days(value: dt.date, shift: int, calendar_code: str | None) -> dt.date:
    code = normalize_calendar_code(calendar_code)
    if shift == 0:
        return value if is_business_day(value, code) else adjust_date(value, code, "following")
    direction = 1 if shift > 0 else -1
    remaining = abs(shift)
    cursor = value
    while remaining > 0:
        cursor += dt.timedelta(days=direction)
        if is_business_day(cursor, code):
            remaining -= 1
    return cursor


def _add_months(value: dt.date, months: int, *, preserve_eom: bool) -> dt.date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    if preserve_eom and value.day == calendar.monthrange(value.year, value.month)[1]:
        return dt.date(year, month, last_day)
    return dt.date(year, month, min(value.day, last_day))


def build_schedule_periods(
    *,
    start_date: dt.date,
    end_date: dt.date,
    frequency_months: int,
    schedule_calendar: str | None,
    fixing_calendar: str | None = None,
    business_day_convention: str | None = None,
    payment_lag_days: int = 0,
    fixing_days_lag: int = 0,
    reset_convention: str | None = None,
) -> list[SchedulePeriod]:
    if frequency_months <= 0 or start_date >= end_date:
        payment_date = adjust_date(end_date, schedule_calendar, business_day_convention)
        fixing_anchor = adjust_date(start_date, fixing_calendar or schedule_calendar, business_day_convention)
        fixing_date = shift_business_days(
            fixing_anchor,
            -(fixing_days_lag or 0),
            fixing_calendar or schedule_calendar,
        )
        return [
            SchedulePeriod(
                accrual_start=adjust_date(start_date, schedule_calendar, business_day_convention),
                accrual_end=payment_date,
                payment_date=shift_business_days(payment_date, payment_lag_days or 0, schedule_calendar),
                fixing_date=fixing_date,
            )
        ]

    schedule_code = normalize_calendar_code(schedule_calendar)
    fixing_code = normalize_calendar_code(fixing_calendar or schedule_calendar)
    bdc = normalize_business_day_convention(business_day_convention)
    reset = normalize_reset_convention(reset_convention)
    preserve_eom = start_date.day == calendar.monthrange(start_date.year, start_date.month)[1]

    periods: list[SchedulePeriod] = []
    current_unadjusted = start_date
    current_adjusted = adjust_date(start_date, schedule_code, bdc)
    while current_unadjusted < end_date:
        next_unadjusted = _add_months(current_unadjusted, frequency_months, preserve_eom=preserve_eom)
        if next_unadjusted >= end_date:
            next_unadjusted = end_date
        accrual_end = adjust_date(next_unadjusted, schedule_code, bdc)
        reset_anchor = current_adjusted if reset == "in_advance" else accrual_end
        fixing_date = shift_business_days(reset_anchor, -(fixing_days_lag or 0), fixing_code)
        payment_date = shift_business_days(accrual_end, payment_lag_days or 0, schedule_code)
        periods.append(
            SchedulePeriod(
                accrual_start=current_adjusted,
                accrual_end=accrual_end,
                payment_date=payment_date,
                fixing_date=fixing_date,
            )
        )
        current_unadjusted = next_unadjusted
        current_adjusted = accrual_end
    return periods


def build_overnight_compounding_segments(
    *,
    start_date: dt.date,
    end_date: dt.date,
    fixing_calendar: str | None,
    fixing_days_lag: int = 0,
) -> list[OvernightCompoundingSegment]:
    if start_date >= end_date:
        return []

    fixing_code = normalize_calendar_code(fixing_calendar)
    current = start_date
    segments: list[OvernightCompoundingSegment] = []
    while current < end_date:
        next_business_day = shift_business_days(current, 1, fixing_code)
        accrual_end = min(next_business_day, end_date)
        fixing_date = shift_business_days(current, -(fixing_days_lag or 0), fixing_code)
        segments.append(
            OvernightCompoundingSegment(
                accrual_start=current,
                accrual_end=accrual_end,
                fixing_date=fixing_date,
            )
        )
        current = accrual_end
    return segments


__all__ = [
    "OvernightCompoundingSegment",
    "SchedulePeriod",
    "adjust_date",
    "build_overnight_compounding_segments",
    "build_schedule_periods",
    "is_business_day",
    "joint_calendar_code",
    "normalize_business_day_convention",
    "normalize_calendar_code",
    "normalize_reset_convention",
    "shift_business_days",
]
