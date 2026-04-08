"""Загрузка и валидация входных данных."""
from __future__ import annotations

import datetime as dt
import json
import math
import re
from pathlib import Path
from typing import TYPE_CHECKING, List, Tuple

import pandas as pd
from pydantic import ValidationError

from .models import OptionPosition, Portfolio
from .models import MarketScenario
from .validation import ValidationMessage

if TYPE_CHECKING:
    from .bootstrap import BootstrappedMarketData


def _parse_date(value: str) -> dt.date:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = str(value).strip()
    if not text:
        raise ValueError("Пустая дата")
    try:
        return dt.date.fromisoformat(text)
    except Exception:
        pass
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return dt.datetime.strptime(text, fmt).date()
        except Exception:
            continue
    raise ValueError(f"Некорректная дата: {value}")


def _is_missing(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, float):
        return not math.isfinite(value)
    return False


def _opt_float(value: object) -> float | None:
    if _is_missing(value):
        return None
    if isinstance(value, str):
        cleaned = value.replace("\u00A0", "").replace(" ", "").replace(",", ".").strip()
        return float(cleaned)
    return float(value)


def _opt_str(value: object) -> str | None:
    if _is_missing(value):
        return None
    return str(value).strip()


def _str_with_default(value: object, default: str) -> str:
    if _is_missing(value):
        return default
    return str(value).strip()


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(col).replace("\ufeff", "").strip() for col in df.columns]
    return df


def _safe_positive(value: float | None, fallback: float = 1.0) -> float:
    if value is None:
        return fallback
    if not math.isfinite(value):
        return fallback
    if value <= 0.0:
        return fallback
    return float(value)


def _direction_to_quantity(direction: object) -> float:
    text = _str_with_default(direction, "buy").lower()
    if any(token in text for token in ("sell", "pay fixed")):
        return -1.0
    return 1.0


def _extract_underlying_symbol(instrument: str, ccy1: str, ccy2: str) -> str:
    pair_match = re.search(r"([A-Z]{3}\s*/\s*[A-Z]{3})", instrument.upper())
    if pair_match:
        return pair_match.group(1).replace(" ", "")
    if ccy1 and ccy2 and ccy1 != ccy2:
        return f"{ccy1}/{ccy2}"
    base = instrument.strip()
    return base if base else "UNKNOWN"


def _trade_row_to_position(
    row: dict,
    *,
    market_bootstrap: BootstrappedMarketData | None = None,
) -> tuple[OptionPosition, List[ValidationMessage]]:
    messages: List[ValidationMessage] = []
    product = _str_with_default(row.get("Продукт"), "").strip()
    product_lower = product.lower()
    instrument = _str_with_default(row.get("Инструмент"), product).strip()
    direction = _str_with_default(row.get("Направление"), "buy")
    position_id = _str_with_default(
        row.get("Номер в клиринговой системе"),
        _str_with_default(row.get("Номер в торговой системе"), ""),
    )
    if not position_id:
        raise ValueError("Не задан идентификатор сделки (Номер в клиринговой/торговой системе)")

    valuation_date = _parse_date(
        _str_with_default(
            row.get("Дата регистрации"),
            _str_with_default(row.get("Начало"), ""),
        )
    )
    start_date = _parse_date(_str_with_default(row.get("Начало"), valuation_date.isoformat()))
    maturity_raw = _str_with_default(
        row.get("Окончание"),
        _str_with_default(row.get("Начало"), ""),
    )
    maturity_date = _parse_date(maturity_raw)
    if maturity_date <= valuation_date:
        maturity_date = valuation_date + dt.timedelta(days=1)

    ccy1 = _str_with_default(row.get("Валюта 1"), "").upper()
    ccy2 = _str_with_default(row.get("Валюта 2"), "").upper()
    currency = ccy2 or ccy1 or "RUB"

    notional_1 = _opt_float(row.get("Сумма 1"))
    notional_2 = _opt_float(row.get("Сумма 2"))
    notional = _safe_positive(abs(notional_1) if notional_1 is not None else None, fallback=1.0)
    quote_ratio = None
    if notional_1 not in (None, 0.0) and notional_2 is not None:
        quote_ratio = abs(notional_2 / notional_1)

    price = _opt_float(row.get("Цена")) or 0.0
    strike_col = _opt_float(row.get("Страйк"))
    spot_col = _opt_float(row.get("Курс"))
    mtm_value = _opt_float(row.get("Стоимость")) or 0.0
    quantity = _direction_to_quantity(direction)
    underlying_symbol = _extract_underlying_symbol(instrument, ccy1, ccy2)

    time_to_maturity = max((maturity_date - valuation_date).days / 365.0, 1.0 / 365.0)

    if "cap" in product_lower or "floor" in product_lower:
        option_type = "call" if "cap" in product_lower else "put"
        underlying_price = _safe_positive(
            _opt_float(row.get("Цена")),
            fallback=_safe_positive(strike_col, fallback=0.01),
        )
        strike = _safe_positive(strike_col, fallback=underlying_price)
        return OptionPosition(
            instrument_type="option",
            position_id=str(position_id),
            option_type=option_type,
            style="european",
            quantity=quantity,
            notional=notional,
            underlying_symbol=underlying_symbol,
            underlying_price=underlying_price,
            strike=strike,
            volatility=0.2,
            maturity_date=maturity_date,
            valuation_date=valuation_date,
            risk_free_rate=0.05,
            dividend_yield=0.0,
            currency=currency,
            liquidity_haircut=0.0,
            model="black_scholes",
        ), messages

    if any(tag in product_lower for tag in ("irs", "ois", "xccy", "basis")):
        fixed_rate = price if math.isfinite(price) else 0.0
        risk_free_rate = fixed_rate if 0.0 <= fixed_rate <= 1.0 else 0.05
        discount = math.exp(-risk_free_rate * time_to_maturity)
        day_count = time_to_maturity
        denom = notional * day_count * discount
        if abs(denom) > 1e-12:
            float_rate = fixed_rate + (mtm_value / quantity) / denom
        else:
            float_rate = risk_free_rate
        strike = _safe_positive(abs(fixed_rate), fallback=1e-8)
        position = OptionPosition(
            instrument_type="swap_ir",
            position_id=str(position_id),
            option_type="call",
            style="european",
            quantity=quantity,
            notional=notional,
            underlying_symbol=underlying_symbol,
            underlying_price=1.0,
            strike=strike,
            volatility=0.0,
            maturity_date=maturity_date,
            valuation_date=valuation_date,
            risk_free_rate=risk_free_rate,
            dividend_yield=0.0,
            currency=currency,
            liquidity_haircut=0.0,
            fixed_rate=fixed_rate,
            float_rate=float_rate,
            day_count=day_count,
        )
        if market_bootstrap is not None:
            position, bootstrap_messages = market_bootstrap.enrich_trade_position(
                position,
                product_text=product,
                instrument_text=instrument,
                ccy1=ccy1,
                ccy2=ccy2,
                notional_1=notional_1,
                notional_2=notional_2,
                start_date=start_date,
            )
            messages.extend(bootstrap_messages)
        return position, messages

    strike = _safe_positive(
        _opt_float(row.get("Цена")),
        fallback=_safe_positive(quote_ratio, fallback=_safe_positive(spot_col, fallback=1.0)),
    )
    risk_free_rate = 0.05
    discount = math.exp(-risk_free_rate * time_to_maturity)
    underlying_price = strike + (mtm_value / quantity) / (notional * discount)
    underlying_price = _safe_positive(underlying_price, fallback=_safe_positive(spot_col, fallback=strike))
    position = OptionPosition(
        instrument_type="forward",
        position_id=str(position_id),
        option_type="call",
        style="european",
        quantity=quantity,
        notional=notional,
        underlying_symbol=underlying_symbol,
        underlying_price=underlying_price,
        strike=strike,
        volatility=0.0,
        maturity_date=maturity_date,
        valuation_date=valuation_date,
        risk_free_rate=risk_free_rate,
        dividend_yield=0.0,
        currency=currency,
        liquidity_haircut=0.0,
    )
    if market_bootstrap is not None:
        position, bootstrap_messages = market_bootstrap.enrich_trade_position(
            position,
            product_text=product,
            instrument_text=instrument,
            ccy1=ccy1,
            ccy2=ccy2,
            notional_1=notional_1,
            notional_2=notional_2,
            start_date=start_date,
        )
        messages.extend(bootstrap_messages)
    return position, messages


def _row_to_position(row: dict) -> OptionPosition:
    mapped = {
        "instrument_type": _str_with_default(row.get("instrument_type"), "option").lower(),
        "position_id": str(row["position_id"]),
        "option_type": _str_with_default(row.get("option_type"), "call").lower(),
        "style": _str_with_default(row.get("style"), "european").lower(),
        "quantity": _opt_float(row["quantity"]),
        "notional": _opt_float(row.get("notional", 1.0)),
        "underlying_symbol": str(row["underlying_symbol"]),
        "underlying_price": _opt_float(row["underlying_price"]),
        "strike": _opt_float(row["strike"]),
        "volatility": _opt_float(row["volatility"]),
        "maturity_date": _parse_date(str(row["maturity_date"])),
        "valuation_date": _parse_date(str(row["valuation_date"])),
        "risk_free_rate": _opt_float(row["risk_free_rate"]),
        "dividend_yield": _opt_float(row.get("dividend_yield", 0.0))
        if not _is_missing(row.get("dividend_yield"))
        else 0.0,
        "currency": _str_with_default(row.get("currency"), "RUB"),
        "liquidity_haircut": _opt_float(row.get("liquidity_haircut", 0.0))
        if not _is_missing(row.get("liquidity_haircut"))
        else 0.0,
        "model": _opt_str(row.get("model")),
        "fixed_rate": _opt_float(row.get("fixed_rate")),
        "float_rate": _opt_float(row.get("float_rate")),
        "day_count": _opt_float(row.get("day_count")),
        "start_date": _parse_date(str(row["start_date"])) if not _is_missing(row.get("start_date")) else None,
        "settlement_date": _parse_date(str(row["settlement_date"]))
        if not _is_missing(row.get("settlement_date"))
        else None,
        "collateral_currency": _opt_str(row.get("collateral_currency")),
        "discount_curve_ref": _opt_str(row.get("discount_curve_ref")),
        "projection_curve_ref": _opt_str(row.get("projection_curve_ref")),
        "fixing_index_ref": _opt_str(row.get("fixing_index_ref")),
        "day_count_convention": _opt_str(row.get("day_count_convention")),
        "business_day_convention": _opt_str(row.get("business_day_convention")),
        "reset_convention": _opt_str(row.get("reset_convention")),
        "payment_lag_days": int(_opt_float(row.get("payment_lag_days")))
        if not _is_missing(row.get("payment_lag_days"))
        else None,
        "fixed_leg_frequency_months": int(_opt_float(row.get("fixed_leg_frequency_months")))
        if not _is_missing(row.get("fixed_leg_frequency_months"))
        else None,
        "float_leg_frequency_months": int(_opt_float(row.get("float_leg_frequency_months")))
        if not _is_missing(row.get("float_leg_frequency_months"))
        else None,
        "float_spread": _opt_float(row.get("float_spread", 0.0))
        if not _is_missing(row.get("float_spread"))
        else 0.0,
        "pay_currency": _opt_str(row.get("pay_currency")),
        "receive_currency": _opt_str(row.get("receive_currency")),
        "pay_leg_notional": _opt_float(row.get("pay_leg_notional")),
        "receive_leg_notional": _opt_float(row.get("receive_leg_notional")),
        "pay_discount_curve_ref": _opt_str(row.get("pay_discount_curve_ref")),
        "receive_discount_curve_ref": _opt_str(row.get("receive_discount_curve_ref")),
        "pay_projection_curve_ref": _opt_str(row.get("pay_projection_curve_ref")),
        "receive_projection_curve_ref": _opt_str(row.get("receive_projection_curve_ref")),
        "pay_day_count_convention": _opt_str(row.get("pay_day_count_convention")),
        "receive_day_count_convention": _opt_str(row.get("receive_day_count_convention")),
        "pay_business_day_convention": _opt_str(row.get("pay_business_day_convention")),
        "receive_business_day_convention": _opt_str(row.get("receive_business_day_convention")),
        "pay_calendar": _opt_str(row.get("pay_calendar")),
        "receive_calendar": _opt_str(row.get("receive_calendar")),
        "pay_fixing_calendar": _opt_str(row.get("pay_fixing_calendar")),
        "receive_fixing_calendar": _opt_str(row.get("receive_fixing_calendar")),
        "pay_fixed_rate": _opt_float(row.get("pay_fixed_rate")),
        "receive_fixed_rate": _opt_float(row.get("receive_fixed_rate")),
        "pay_spread": _opt_float(row.get("pay_spread", 0.0))
        if not _is_missing(row.get("pay_spread"))
        else 0.0,
        "receive_spread": _opt_float(row.get("receive_spread", 0.0))
        if not _is_missing(row.get("receive_spread"))
        else 0.0,
        "fixing_days_lag": int(_opt_float(row.get("fixing_days_lag")))
        if not _is_missing(row.get("fixing_days_lag"))
        else None,
        "pay_fixing_days_lag": int(_opt_float(row.get("pay_fixing_days_lag")))
        if not _is_missing(row.get("pay_fixing_days_lag"))
        else None,
        "receive_fixing_days_lag": int(_opt_float(row.get("receive_fixing_days_lag")))
        if not _is_missing(row.get("receive_fixing_days_lag"))
        else None,
        "pay_payment_lag_days": int(_opt_float(row.get("pay_payment_lag_days")))
        if not _is_missing(row.get("pay_payment_lag_days"))
        else None,
        "receive_payment_lag_days": int(_opt_float(row.get("receive_payment_lag_days")))
        if not _is_missing(row.get("receive_payment_lag_days"))
        else None,
        "pay_reset_convention": _opt_str(row.get("pay_reset_convention")),
        "receive_reset_convention": _opt_str(row.get("receive_reset_convention")),
        "exchange_principal": bool(row.get("exchange_principal"))
        if not _is_missing(row.get("exchange_principal"))
        else False,
        "spot_fx": _opt_float(row.get("spot_fx")),
    }
    return OptionPosition(**mapped)


def load_portfolio_from_csv(
    path: Path,
    *,
    market_bootstrap: BootstrappedMarketData | None = None,
) -> Tuple[Portfolio, List[ValidationMessage]]:
    """Загрузка портфеля из CSV. Возвращает портфель и журнал валидации."""
    messages: List[ValidationMessage] = []
    df = _normalize_columns(pd.read_csv(path))
    canonical_required = [
        "position_id",
        "quantity",
        "underlying_symbol",
        "underlying_price",
        "strike",
        "volatility",
        "maturity_date",
        "valuation_date",
        "risk_free_rate",
    ]
    trade_mode = "Продукт" in df.columns and "Инструмент" in df.columns and (
        "Номер в клиринговой системе" in df.columns or "Номер в торговой системе" in df.columns
    )
    if not trade_mode:
        for col in canonical_required:
            if col not in df.columns:
                raise ValueError(
                    f"В CSV отсутствует обязательное поле {col}. "
                    "Поддерживаются либо стандартный формат портфеля, либо trade-export с колонками "
                    "'Продукт/Инструмент/Направление/Дата регистрации/Окончание'."
                )

    positions: List[OptionPosition] = []
    for idx, row in df.iterrows():
        try:
            row_messages: List[ValidationMessage] = []
            if trade_mode:
                position, row_messages = _trade_row_to_position(row, market_bootstrap=market_bootstrap)
            else:
                position = _row_to_position(row)
            for row_message in row_messages:
                messages.append(
                    ValidationMessage(
                        severity=row_message.severity,
                        message=row_message.message,
                        row=row_message.row if row_message.row is not None else int(idx + 2),
                        field=row_message.field,
                    )
                )
            positions.append(position)
        except (ValidationError, ValueError) as exc:
            messages.append(
                ValidationMessage(
                    severity="ERROR",
                    message=str(exc),
                    row=int(idx + 2),  # +2 из-за заголовка и нумерации с 1
                )
            )
    if not positions:
        raise ValueError("Не удалось загрузить ни одной позиции: все строки с ошибками")
    return Portfolio(positions=positions), messages


def load_portfolio_from_json(path: Path) -> Tuple[Portfolio, List[ValidationMessage]]:
    """Загрузка портфеля из JSON."""
    messages: List[ValidationMessage] = []
    raw = json.loads(Path(path).read_text())
    if not isinstance(raw, list):
        raise ValueError("Ожидается список позиций в JSON")

    positions: List[OptionPosition] = []
    for idx, row in enumerate(raw):
        try:
            position = _row_to_position(row)
            positions.append(position)
        except (ValidationError, ValueError) as exc:
            messages.append(
                ValidationMessage(
                    severity="ERROR",
                    message=str(exc),
                    row=idx,
                )
            )
    if not positions:
        raise ValueError("Не удалось загрузить ни одной позиции: все записи с ошибками")
    return Portfolio(positions=positions), messages


def load_scenarios_from_csv(path: Path) -> List[MarketScenario]:
    df = pd.read_csv(path)
    required = ["scenario_id", "underlying_shift", "volatility_shift", "rate_shift"]
    for col in required:
        if col not in df.columns:
            raise ValueError(f"В CSV сценариев отсутствует поле {col}")
    scenarios: List[MarketScenario] = []
    for _, row in df.iterrows():
        scenarios.append(
            MarketScenario(
                scenario_id=str(row["scenario_id"]),
                underlying_shift=float(row.get("underlying_shift", 0.0)),
                volatility_shift=float(row.get("volatility_shift", 0.0)),
                rate_shift=float(row.get("rate_shift", 0.0)),
                probability=(
                    float(row.get("probability"))
                    if "probability" in df.columns and not _is_missing(row.get("probability"))
                    else None
                ),
            )
        )
    return scenarios


def load_scenarios_from_json(path: Path) -> List[MarketScenario]:
    raw = json.loads(Path(path).read_text())
    if not isinstance(raw, list):
        raise ValueError("Ожидается список сценариев")
    scenarios: List[MarketScenario] = []
    for row in raw:
        scenarios.append(
            MarketScenario(
                scenario_id=str(row["scenario_id"]),
                underlying_shift=float(row.get("underlying_shift", 0.0)),
                volatility_shift=float(row.get("volatility_shift", 0.0)),
                rate_shift=float(row.get("rate_shift", 0.0)),
                probability=(
                    float(row.get("probability"))
                    if not _is_missing(row.get("probability"))
                    else None
                ),
            )
        )
    return scenarios
