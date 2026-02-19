"""Простейший FastAPI для расчётов портфеля."""
from __future__ import annotations

import logging
import uuid

from fastapi import FastAPI
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .data.models import MarketScenario, OptionPosition, Portfolio
from .risk.pipeline import CalculationConfig, run_calculation


class PortfolioRequest(BaseModel):
    positions: list[OptionPosition]
    scenarios: list[MarketScenario]
    limits: dict | None = None
    alpha: float = 0.99
    horizon_days: int = 1
    base_currency: str = "RUB"
    fx_rates: dict[str, float] | None = None
    liquidity_model: str = "fraction_of_position_value"
    mode: str = "demo"
    calc_sensitivities: bool = True
    calc_var_es: bool = True
    calc_stress: bool = True
    calc_margin_capital: bool = True


app = FastAPI(title="Option Risk API", version="0.1.0")
logger = logging.getLogger("option_risk.api")


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
            alpha=req.alpha,
            horizon_days=req.horizon_days,
            base_currency=req.base_currency,
            fx_rates=req.fx_rates,
            liquidity_model=req.liquidity_model,
            mode=req.mode,
        )
        result = run_calculation(portfolio, req.scenarios, req.limits, cfg)
        return result.__dict__
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/health")
def health():
    return {"status": "ok"}
