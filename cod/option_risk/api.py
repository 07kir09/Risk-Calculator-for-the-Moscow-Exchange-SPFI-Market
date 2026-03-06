"""Простейший FastAPI для расчётов портфеля."""
from __future__ import annotations

import math
import logging
import uuid
import json
from dataclasses import asdict, is_dataclass
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .data.loading import load_scenarios_from_csv
from .data.models import MarketScenario, OptionPosition, Portfolio
from .risk.pipeline import CalculationConfig, run_calculation


class PortfolioRequest(BaseModel):
    positions: list[OptionPosition]
    scenarios: list[MarketScenario]
    limits: dict | None = None
    alpha: float = 0.99
    horizon_days: int = 1
    parametric_tail_model: str = "normal"
    base_currency: str = "RUB"
    fx_rates: dict[str, float] | None = None
    liquidity_model: str = "fraction_of_position_value"
    mode: str = "demo"
    calc_sensitivities: bool = True
    calc_var_es: bool = True
    calc_stress: bool = True
    calc_margin_capital: bool = True
    calc_correlations: bool = True


app = FastAPI(title="Option Risk API", version="0.1.0")
logger = logging.getLogger("option_risk.api")
ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SCENARIOS_CSV = ROOT_DIR / "examples" / "scenarios.csv"
DEFAULT_LIMITS_JSON = ROOT_DIR / "examples" / "limits.json"


def _json_safe(value):
    if isinstance(value, float):
        return value if math.isfinite(value) else 0.0
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if is_dataclass(value):
        return _json_safe(asdict(value))
    return value


@lru_cache(maxsize=1)
def _default_limits() -> dict:
    if not DEFAULT_LIMITS_JSON.exists():
        return {}
    return json.loads(DEFAULT_LIMITS_JSON.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _default_scenarios() -> list[MarketScenario]:
    if not DEFAULT_SCENARIOS_CSV.exists():
        return []
    return load_scenarios_from_csv(DEFAULT_SCENARIOS_CSV)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    trace_id = str(uuid.uuid4())
    request.state.request_id = request_id
    request.state.trace_id = trace_id

    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    response.headers["x-trace-id"] = trace_id
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    logger.info("validation_error requestId=%s traceId=%s", getattr(request.state, "request_id", None), getattr(request.state, "trace_id", None))
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "message": "Ошибка валидации запроса",
            "details": exc.errors(),
            "requestId": getattr(request.state, "request_id", None),
            "traceId": getattr(request.state, "trace_id", None),
        },
    )


@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": "http_error",
            "message": str(exc.detail),
            "requestId": getattr(request.state, "request_id", None),
            "traceId": getattr(request.state, "trace_id", None),
        },
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    logger.exception(
        "unhandled_error requestId=%s traceId=%s path=%s",
        getattr(request.state, "request_id", None),
        getattr(request.state, "trace_id", None),
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={
            "code": "internal_error",
            "message": "Внутренняя ошибка сервера при расчёте",
            "details": str(exc),
            "requestId": getattr(request.state, "request_id", None),
            "traceId": getattr(request.state, "trace_id", None),
        },
    )


@app.post("/metrics")
def compute_metrics(req: PortfolioRequest):
    try:
        portfolio = Portfolio(positions=req.positions)
        cfg = CalculationConfig(
            calc_sensitivities=req.calc_sensitivities,
            calc_var_es=req.calc_var_es,
            calc_stress=req.calc_stress,
            calc_margin_capital=req.calc_margin_capital,
            calc_correlations=req.calc_correlations,
            alpha=req.alpha,
            horizon_days=req.horizon_days,
            parametric_tail_model=req.parametric_tail_model,
            base_currency=req.base_currency,
            fx_rates=req.fx_rates,
            liquidity_model=req.liquidity_model,
            mode=req.mode,
        )
        result = run_calculation(portfolio, req.scenarios, req.limits, cfg)
        return _json_safe(result.__dict__)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/limits")
def get_limits():
    return _json_safe(_default_limits())


@app.get("/scenarios")
def get_scenarios():
    return _json_safe(_default_scenarios())


@app.get("/health")
def health():
    return {"status": "ok"}
