"""Модели входных данных и сценариев для риск-калькулятора."""
from __future__ import annotations

import datetime as dt
import math
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, root_validator, validator


class InstrumentType(str, Enum):
    OPTION = "option"
    FORWARD = "forward"
    SWAP_IR = "swap_ir"


class OptionType(str, Enum):
    CALL = "call"
    PUT = "put"


class OptionStyle(str, Enum):
    EUROPEAN = "european"
    AMERICAN = "american"


class MarketEnvironment(BaseModel):
    """Параметры рынка, применяемые по умолчанию при расчете."""

    valuation_date: dt.date = Field(..., description="Дата оценки")
    risk_free_rate: float = Field(..., description="Безрисковая ставка, десятичная доля")
    dividend_yield: float = Field(0.0, description="Дивидендная доходность, десятичная доля")

    @validator("risk_free_rate")
    def _validate_rate(cls, value: float) -> float:
        if value < -1.0:
            raise ValueError("Безрисковая ставка выглядит некорректной (меньше -100%)")
        return float(value)

    @validator("dividend_yield")
    def _validate_dividend(cls, value: float) -> float:
        if value < 0:
            raise ValueError("Дивидендная доходность не может быть отрицательной")
        return float(value)


class OptionPosition(BaseModel):
    """Описание позиции (опцион/форвард/процентный своп)."""

    instrument_type: InstrumentType = Field(InstrumentType.OPTION, description="Тип инструмента")
    position_id: str = Field(..., description="Уникальный идентификатор позиции")
    option_type: OptionType = Field(
        OptionType.CALL,
        description="Тип опциона (call/put). Для форвардов/свопов используется значение по умолчанию.",
    )
    style: OptionStyle = OptionStyle.EUROPEAN
    quantity: float = Field(..., description="Кол-во контрактов (знак отражает направление)")
    notional: float = Field(1.0, description="Номинал/мультипликатор (для форвардов/свопов)")
    underlying_symbol: str = Field(..., description="Тикер базового актива")
    underlying_price: float = Field(..., description="Текущая цена базового актива")
    strike: float = Field(..., description="Цена страйк / форвардная цена / фикс по свопу")
    volatility: float = Field(
        0.0,
        description="Годовая волатильность, десятичная доля (для опционов > 0; для форвардов/свопов может быть 0).",
    )
    maturity_date: dt.date = Field(..., description="Дата экспирации/платежа")
    valuation_date: dt.date = Field(..., description="Дата оценки")
    risk_free_rate: float = Field(..., description="Безрисковая ставка, десятичная доля")
    dividend_yield: float = Field(0.0, description="Дивидендная доходность, десятичная доля")
    currency: str = Field("RUB", description="Валюта расчета по ISO 4217")
    liquidity_haircut: float = Field(
        0.0,
        description=(
            "Параметр ликвидностной надбавки. Единицы зависят от выбранной liquidity модели: "
            "доля от стоимости позиции, half-spread в долях, либо абсолют на контракт."
        ),
    )
    model: Optional[str] = Field(
        None, description="Предпочитаемая модель оценки (black_scholes|binomial|mc)"
    )
    fixed_rate: Optional[float] = Field(None, description="Фиксированная ставка (для свопа)")
    float_rate: Optional[float] = Field(None, description="Плавающая ставка (для свопа)")
    day_count: Optional[float] = Field(None, description="Доля года для ближайшего купонного периода")
    start_date: Optional[dt.date] = Field(None, description="Дата начала сделки/первого accrual периода")
    settlement_date: Optional[dt.date] = Field(None, description="Дата финального расчета")
    collateral_currency: Optional[str] = Field(None, description="Валюта CSA/коллатерализации")
    discount_curve_ref: Optional[str] = Field(None, description="Ссылка на discount curve")
    projection_curve_ref: Optional[str] = Field(None, description="Ссылка на projection/forward curve")
    fixing_index_ref: Optional[str] = Field(None, description="Ссылка на индекс/фиксинг")
    day_count_convention: Optional[str] = Field(None, description="Day count convention, например ACT/360")
    business_day_convention: Optional[str] = Field(None, description="Business day convention, например modified_following")
    reset_convention: Optional[str] = Field(None, description="Reset convention: in_advance или in_arrears")
    payment_lag_days: Optional[int] = Field(None, description="Общий лаг платежа в business days")
    fixed_leg_frequency_months: Optional[int] = Field(None, description="Частота фиксированной ноги в месяцах")
    float_leg_frequency_months: Optional[int] = Field(None, description="Частота плавающей ноги в месяцах")
    float_spread: float = Field(0.0, description="Спред над плавающей ставкой")
    pay_currency: Optional[str] = Field(None, description="Валюта pay leg")
    receive_currency: Optional[str] = Field(None, description="Валюта receive leg")
    pay_leg_notional: Optional[float] = Field(None, description="Номинал pay leg")
    receive_leg_notional: Optional[float] = Field(None, description="Номинал receive leg")
    pay_discount_curve_ref: Optional[str] = Field(None, description="Discount curve для pay leg")
    receive_discount_curve_ref: Optional[str] = Field(None, description="Discount curve для receive leg")
    pay_projection_curve_ref: Optional[str] = Field(None, description="Projection curve для pay leg")
    receive_projection_curve_ref: Optional[str] = Field(None, description="Projection curve для receive leg")
    pay_day_count_convention: Optional[str] = Field(None, description="Day count convention pay leg")
    receive_day_count_convention: Optional[str] = Field(None, description="Day count convention receive leg")
    pay_business_day_convention: Optional[str] = Field(None, description="Business day convention pay leg")
    receive_business_day_convention: Optional[str] = Field(None, description="Business day convention receive leg")
    pay_calendar: Optional[str] = Field(None, description="Календарь/бизнес-календарь pay leg")
    receive_calendar: Optional[str] = Field(None, description="Календарь/бизнес-календарь receive leg")
    pay_fixing_calendar: Optional[str] = Field(None, description="Календарь reset/fixing для pay leg")
    receive_fixing_calendar: Optional[str] = Field(None, description="Календарь reset/fixing для receive leg")
    pay_fixed_rate: Optional[float] = Field(None, description="Фиксированная ставка pay leg")
    receive_fixed_rate: Optional[float] = Field(None, description="Фиксированная ставка receive leg")
    pay_spread: float = Field(0.0, description="Спред над pay floating leg")
    receive_spread: float = Field(0.0, description="Спред над receive floating leg")
    fixing_days_lag: Optional[int] = Field(None, description="Lag фиксации в днях")
    pay_fixing_days_lag: Optional[int] = Field(None, description="Lag фиксации в business days для pay leg")
    receive_fixing_days_lag: Optional[int] = Field(None, description="Lag фиксации в business days для receive leg")
    pay_payment_lag_days: Optional[int] = Field(None, description="Lag платежа в business days для pay leg")
    receive_payment_lag_days: Optional[int] = Field(None, description="Lag платежа в business days для receive leg")
    pay_reset_convention: Optional[str] = Field(None, description="Reset convention pay leg")
    receive_reset_convention: Optional[str] = Field(None, description="Reset convention receive leg")
    exchange_principal: bool = Field(False, description="Обмен номиналами в финале")
    spot_fx: Optional[float] = Field(None, description="FX spot для XCCY/FX forward repricing")

    @validator("quantity")
    def _check_quantity(cls, value: float) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Количество контрактов должно быть конечным числом")
        if value == 0:
            raise ValueError("Количество контрактов не может быть нулевым")
        return value

    @validator("notional")
    def _validate_notional(cls, value: float) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Номинал должен быть конечным числом")
        if value < 0:
            raise ValueError("Номинал не может быть отрицательным")
        return value

    @validator("underlying_price", "strike")
    def _positive_prices(cls, value: float) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Цена/страйк должны быть конечным числом")
        if value <= 0:
            raise ValueError("Цена/страйк должны быть больше нуля")
        return value

    @validator("volatility")
    def _validate_vol(cls, value: float, values) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Волатильность должна быть конечным числом")
        inst = values.get("instrument_type", InstrumentType.OPTION)
        if inst == InstrumentType.OPTION:
            if value <= 0:
                raise ValueError("Волатильность должна быть положительной")
        else:
            if value < 0:
                raise ValueError("Волатильность не может быть отрицательной")
        return value

    @validator("risk_free_rate")
    def _validate_risk_free_rate(cls, value: float) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Безрисковая ставка должна быть конечным числом")
        if value < -1.0:
            raise ValueError("Безрисковая ставка выглядит некорректной (меньше -100%)")
        return value

    @validator("dividend_yield")
    def _validate_dividend_yield(cls, value: float) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Дивидендная доходность должна быть конечным числом")
        if value < 0:
            raise ValueError("Дивидендная доходность не может быть отрицательной")
        return value

    @validator("liquidity_haircut")
    def _validate_liquidity_haircut(cls, value: float) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Ликвидностная надбавка должна быть конечным числом")
        if value < 0:
            raise ValueError("Ликвидностная надбавка не может быть отрицательной")
        return value

    @validator(
        "fixed_rate",
        "float_rate",
        "day_count",
        "pay_fixed_rate",
        "receive_fixed_rate",
        "pay_leg_notional",
        "receive_leg_notional",
        "spot_fx",
    )
    def _validate_optional_floats(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Параметр должен быть конечным числом")
        return value

    @validator("float_spread", "pay_spread", "receive_spread")
    def _validate_spreads(cls, value: float) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError("Спред должен быть конечным числом")
        return value

    @validator("fixed_leg_frequency_months", "float_leg_frequency_months")
    def _validate_optional_positive_ints(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return None
        ivalue = int(value)
        if ivalue <= 0:
            raise ValueError("Параметр должен быть положительным целым числом")
        return ivalue

    @validator(
        "fixing_days_lag",
        "payment_lag_days",
        "pay_fixing_days_lag",
        "receive_fixing_days_lag",
        "pay_payment_lag_days",
        "receive_payment_lag_days",
    )
    def _validate_optional_non_negative_int(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return None
        ivalue = int(value)
        if ivalue < 0:
            raise ValueError("Параметр должен быть неотрицательным целым числом")
        return ivalue

    @validator(
        "collateral_currency",
        "discount_curve_ref",
        "projection_curve_ref",
        "fixing_index_ref",
        "day_count_convention",
        "business_day_convention",
        "reset_convention",
        "pay_discount_curve_ref",
        "receive_discount_curve_ref",
        "pay_projection_curve_ref",
        "receive_projection_curve_ref",
        "pay_day_count_convention",
        "receive_day_count_convention",
        "pay_business_day_convention",
        "receive_business_day_convention",
        "pay_calendar",
        "receive_calendar",
        "pay_fixing_calendar",
        "receive_fixing_calendar",
        "pay_reset_convention",
        "receive_reset_convention",
        pre=True,
    )
    def _normalize_optional_refs(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @root_validator(skip_on_failure=True)
    def _check_dates(cls, values):
        maturity_date = values.get("maturity_date")
        valuation_date = values.get("valuation_date")
        if maturity_date and valuation_date and maturity_date <= valuation_date:
            raise ValueError("Дата экспирации должна быть позже даты оценки")
        inst = values.get("instrument_type", InstrumentType.OPTION)
        if inst == InstrumentType.SWAP_IR:
            # fixed_rate/float_rate могут быть заданы явно, но по умолчанию фикс берём из strike,
            # а float — из risk_free_rate (упрощение для проекта).
            day_count = values.get("day_count")
            if day_count is not None and day_count <= 0:
                raise ValueError("day_count для свопа должен быть больше 0")
        settlement_date = values.get("settlement_date")
        if settlement_date and valuation_date and settlement_date <= valuation_date:
            raise ValueError("Дата расчетов должна быть позже даты оценки")
        start_date = values.get("start_date")
        if start_date and maturity_date and start_date > maturity_date:
            raise ValueError("Дата начала сделки не может быть позже maturity_date")
        return values

    @validator("currency", "pay_currency", "receive_currency", "collateral_currency")
    def _validate_currency(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        code = value.strip().upper()
        if len(code) != 3 or not code.isalpha():
            raise ValueError("Валюта должна быть указана в формате ISO 4217 (три буквы)")
        return code

    def time_to_maturity(self) -> float:
        """Расчет времени до экспирации в годах (ACT/365)."""
        terminal_date = self.settlement_date or self.maturity_date
        delta = terminal_date - self.valuation_date
        return delta.days / 365.0

    def effective_start_date(self) -> dt.date:
        return self.start_date or self.valuation_date

    def effective_end_date(self) -> dt.date:
        return self.settlement_date or self.maturity_date


class MarketScenario(BaseModel):
    """Сценарий изменения рыночных параметров."""

    scenario_id: str
    underlying_shift: float = Field(
        0.0, description="Относительное изменение цены базового актива (например, 0.05 для +5%)"
    )
    volatility_shift: float = Field(
        0.0, description="Относительное изменение волатильности (0.1 для +10%)"
    )
    rate_shift: float = Field(0.0, description="Абсолютное изменение ставки (в долях)")
    curve_shifts: Optional[Dict[str, float]] = Field(
        None,
        description="Параллельные шоки конкретных кривых: {curve_ref: absolute_shift}",
    )
    fx_spot_shifts: Optional[Dict[str, float]] = Field(
        None,
        description="Относительные шоки FX spot по коду валюты или паре: {key: relative_shift}",
    )
    probability: Optional[float] = Field(
        None,
        description=(
            "Вероятность сценария (необязательная). "
            "Если хотя бы у одного сценария задана, то должна быть задана у всех; "
            "в расчете значения нормализуются на сумму."
        ),
    )

    @validator("probability")
    def _validate_probability(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        prob = float(value)
        if not math.isfinite(prob):
            raise ValueError("Вероятность сценария должна быть конечным числом")
        if prob < 0.0:
            raise ValueError("Вероятность сценария не может быть отрицательной")
        return prob

    @validator("curve_shifts", "fx_spot_shifts")
    def _validate_shift_maps(cls, value: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        if value is None:
            return None
        out: Dict[str, float] = {}
        for key, raw in value.items():
            name = str(key).strip()
            if not name:
                raise ValueError("Ключ шока не может быть пустым")
            shift = float(raw)
            if not math.isfinite(shift):
                raise ValueError("Шоки должны быть конечными числами")
            out[name] = shift
        return out


class Portfolio(BaseModel):
    """Портфель опционных позиций."""

    positions: List[OptionPosition]

    def by_symbol(self, symbol: str) -> List[OptionPosition]:
        return [p for p in self.positions if p.underlying_symbol == symbol]
