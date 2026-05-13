"""Shared API contract helpers for the Option Risk FastAPI layer."""
from __future__ import annotations

import math
import os
from typing import Any, Dict, Iterable, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field


DEFAULT_MAX_CORRELATION_POSITIONS = 200
MAX_CORRELATION_POSITIONS_ENV = "OPTION_RISK_MAX_CORRELATION_POSITIONS"
SUPPORTED_METRICS_INCLUDES = frozenset({"correlations"})


def normalize_include(raw: object) -> set[str]:
    """Normalize body/query include values to a supported include set."""
    if raw is None:
        return set()

    values: Iterable[object]
    if isinstance(raw, (list, tuple, set)):
        values = raw
    else:
        values = [raw]

    includes: set[str] = set()
    for value in values:
        if value is None:
            continue
        for chunk in str(value).split(","):
            name = chunk.strip().lower()
            if not name:
                continue
            if name not in SUPPORTED_METRICS_INCLUDES:
                raise ValueError(f"Unsupported include value: {name}")
            includes.add(name)
    return includes


def resolve_metrics_include(body_include: object, query_include: object) -> set[str]:
    """Resolve effective include list with body taking priority over query string."""
    return normalize_include(body_include) if body_include is not None else normalize_include(query_include)


def metrics_should_calculate_correlations(calc_correlations: bool | None, includes: set[str]) -> bool:
    return bool(calc_correlations) or "correlations" in includes


def max_correlation_positions_from_env() -> int:
    raw = os.environ.get(MAX_CORRELATION_POSITIONS_ENV)
    if raw is None or raw == "":
        return DEFAULT_MAX_CORRELATION_POSITIONS
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{MAX_CORRELATION_POSITIONS_ENV} must be an integer") from exc
    return max(1, value)


def _validate_limit_number(key: str, raw: object) -> float:
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise ValueError(f"limits.{key} must be a number")
    value = float(raw)
    if not math.isfinite(value):
        raise ValueError(f"limits.{key} must be finite")
    if value < 0.0:
        raise ValueError(f"limits.{key} must be non-negative")
    return value


def validate_limits_config(raw: object) -> dict | None:
    """Validate limits before Pydantic can coerce strings to numbers."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("limits must be an object")
    if not raw:
        raise ValueError("limits must not be empty")

    validated: dict[str, object] = {}
    for key, value in raw.items():
        name = str(key).strip()
        if not name:
            raise ValueError("limits keys must not be empty")
        if name == "stress":
            if not isinstance(value, dict):
                raise ValueError("limits.stress must be an object")
            if not value:
                raise ValueError("limits.stress must not be empty")
            validated[name] = {
                str(scenario_id): _validate_limit_number(f"stress.{scenario_id}", limit)
                for scenario_id, limit in value.items()
            }
        else:
            validated[name] = _validate_limit_number(name, value)
    return validated


class ValidationMessageSchema(BaseModel):
    severity: Literal["INFO", "WARNING", "ERROR"]
    message: str
    row: Optional[int] = None
    field: Optional[str] = None

    class Config:
        extra = "forbid"


class LcBreakdownRowSchema(BaseModel):
    position_id: str
    model: str
    quantity: float
    position_value: float
    haircut_input: float
    add_on_money: float

    class Config:
        extra = "forbid"


class StressRowSchema(BaseModel):
    scenario_id: str
    pnl: float
    limit: Optional[float] = None
    breached: bool

    class Config:
        extra = "forbid"


class ContributorRowSchema(BaseModel):
    metric: Optional[str] = None
    position_id: str
    scenario_id: Optional[str] = None
    pnl_contribution: float
    abs_pnl_contribution: float

    class Config:
        extra = "forbid"


class DataQualitySchema(BaseModel):
    market_data_completeness: Literal["complete", "incomplete"] = "complete"
    missing_curves: List[str] = Field(default_factory=list)
    missing_fx: List[str] = Field(default_factory=list)
    affected_positions: List[str] = Field(default_factory=list)
    partial_positions_count: int = 0
    warnings: List[str] = Field(default_factory=list)

    class Config:
        extra = "forbid"


class MetricsResponse(BaseModel):
    base_value: Optional[float] = None
    var_hist: Optional[float] = None
    es_hist: Optional[float] = None
    var_param: Optional[float] = None
    es_param: Optional[float] = None
    lc_var: Optional[float] = None
    lc_var_addon: Optional[float] = None
    lc_var_breakdown: Optional[List[LcBreakdownRowSchema]] = None
    greeks: Optional[Dict[str, float]] = None
    stress: Optional[List[StressRowSchema]] = None
    top_contributors: Optional[Dict[str, List[ContributorRowSchema]]] = None
    limits: Optional[List[Tuple[str, float, float, bool]]] = None
    correlations: Optional[List[List[float]]] = None
    pnl_matrix: Optional[List[List[float]]] = None
    pnl_distribution: Optional[List[float]] = None
    buckets: Optional[Dict[str, Dict[str, float]]] = None
    base_currency: Optional[str] = None
    confidence_level: Optional[float] = None
    horizon_days: Optional[int] = None
    parametric_tail_model: Optional[str] = None
    mode: Optional[str] = None
    methodology_note: Optional[str] = None
    fx_warning: Optional[str] = None
    liquidity_model: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    worst_stress: Optional[float] = None
    capital: Optional[float] = None
    initial_margin: Optional[float] = None
    variation_margin: Optional[float] = None
    calculation_status: Literal["complete"] = "complete"
    data_quality: DataQualitySchema = Field(default_factory=DataQualitySchema)
    market_data_completeness: Literal["complete", "incomplete"] = "complete"
    market_data_source: Optional[str] = None
    methodology_status: Optional[str] = None
    valuation_label: str = "Net PV / MtM"
    var_method: str = "scenario_quantile"
    validation_log: List[ValidationMessageSchema] = Field(default_factory=list)

    class Config:
        extra = "forbid"


__all__ = [
    "ContributorRowSchema",
    "DataQualitySchema",
    "DEFAULT_MAX_CORRELATION_POSITIONS",
    "LcBreakdownRowSchema",
    "MAX_CORRELATION_POSITIONS_ENV",
    "MetricsResponse",
    "StressRowSchema",
    "SUPPORTED_METRICS_INCLUDES",
    "ValidationMessageSchema",
    "max_correlation_positions_from_env",
    "metrics_should_calculate_correlations",
    "normalize_include",
    "resolve_metrics_include",
    "validate_limits_config",
]
