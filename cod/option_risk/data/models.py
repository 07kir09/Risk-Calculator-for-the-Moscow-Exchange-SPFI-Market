"""Модели входных данных и сценариев для риск-калькулятора."""
from __future__ import annotations

import datetime as dt
import math
from enum import Enum
from typing import List, Optional

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
        description="Ликвидностная надбавка/спред на контракт (денежный, абсолютный)",
    )
    model: Optional[str] = Field(
        None, description="Предпочитаемая модель оценки (black_scholes|binomial|mc)"
    )
    fixed_rate: Optional[float] = Field(None, description="Фиксированная ставка (для свопа)")
    float_rate: Optional[float] = Field(None, description="Плавающая ставка (для свопа)")
    day_count: Optional[float] = Field(None, description="Доля года для ближайшего купонного периода")

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
    def _positive_prices(cls, value: float, field) -> float:
        value = float(value)
        if not math.isfinite(value):
            raise ValueError(f"{field.name} должен быть конечным числом")
        if value <= 0:
            raise ValueError(f"{field.name} должен быть больше нуля")
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

    @validator("fixed_rate", "float_rate", "day_count")
    def _validate_optional_floats(cls, value: Optional[float], field) -> Optional[float]:
        if value is None:
            return None
        value = float(value)
        if not math.isfinite(value):
            raise ValueError(f"{field.name} должен быть конечным числом")
        return value

    @root_validator
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
        return values

    @validator("currency")
    def _validate_currency(cls, value: str) -> str:
        code = value.strip().upper()
        if len(code) != 3 or not code.isalpha():
            raise ValueError("Валюта должна быть указана в формате ISO 4217 (три буквы)")
        return code

    def time_to_maturity(self) -> float:
        """Расчет времени до экспирации в годах (ACT/365)."""
        delta = self.maturity_date - self.valuation_date
        return delta.days / 365.0


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


class Portfolio(BaseModel):
    """Портфель опционных позиций."""

    positions: List[OptionPosition]

    def by_symbol(self, symbol: str) -> List[OptionPosition]:
        return [p for p in self.positions if p.underlying_symbol == symbol]
