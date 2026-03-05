"""Загрузка и валидация входных данных."""
from __future__ import annotations

import datetime as dt
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

import pandas as pd
from pydantic import ValidationError

from .models import OptionPosition, Portfolio
from .models import MarketScenario


@dataclass
class ValidationMessage:
    """Сообщение в журнале проверки данных."""

    severity: str  # INFO | WARNING | ERROR
    message: str
    row: int | None = None
    field: str | None = None


def _parse_date(value: str) -> dt.date:
    try:
        return dt.date.fromisoformat(value)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Некорректная дата (ожидается ISO 8601): {value}") from exc


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
    return float(value)


def _opt_str(value: object) -> str | None:
    if _is_missing(value):
        return None
    return str(value).strip()


def _str_with_default(value: object, default: str) -> str:
    if _is_missing(value):
        return default
    return str(value).strip()


def _row_to_position(row: dict) -> OptionPosition:
    mapped = {
        "instrument_type": _str_with_default(row.get("instrument_type"), "option").lower(),
        "position_id": str(row["position_id"]),
        "option_type": _str_with_default(row.get("option_type"), "call").lower(),
        "style": _str_with_default(row.get("style"), "european").lower(),
        "quantity": float(row["quantity"]),
        "notional": float(row.get("notional", 1.0)),
        "underlying_symbol": str(row["underlying_symbol"]),
        "underlying_price": float(row["underlying_price"]),
        "strike": float(row["strike"]),
        "volatility": float(row["volatility"]),
        "maturity_date": _parse_date(str(row["maturity_date"])),
        "valuation_date": _parse_date(str(row["valuation_date"])),
        "risk_free_rate": float(row["risk_free_rate"]),
        "dividend_yield": float(row.get("dividend_yield", 0.0))
        if not _is_missing(row.get("dividend_yield"))
        else 0.0,
        "currency": _str_with_default(row.get("currency"), "RUB"),
        "liquidity_haircut": float(row.get("liquidity_haircut", 0.0))
        if not _is_missing(row.get("liquidity_haircut"))
        else 0.0,
        "model": _opt_str(row.get("model")),
        "fixed_rate": _opt_float(row.get("fixed_rate")),
        "float_rate": _opt_float(row.get("float_rate")),
        "day_count": _opt_float(row.get("day_count")),
    }
    return OptionPosition(**mapped)


def load_portfolio_from_csv(path: Path) -> Tuple[Portfolio, List[ValidationMessage]]:
    """Загрузка портфеля из CSV. Возвращает портфель и журнал валидации."""
    messages: List[ValidationMessage] = []
    df = pd.read_csv(path)
    required = [
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
    for col in required:
        if col not in df.columns:
            raise ValueError(f"В CSV отсутствует обязательное поле {col}")

    positions: List[OptionPosition] = []
    for idx, row in df.iterrows():
        try:
            position = _row_to_position(row)
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
