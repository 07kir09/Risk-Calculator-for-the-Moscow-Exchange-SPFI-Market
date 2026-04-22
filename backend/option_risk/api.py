"""Простейший FastAPI для расчётов портфеля."""
from __future__ import annotations

import math
import logging
import os
import uuid
import datetime as dt
from dataclasses import asdict, is_dataclass
from pathlib import Path

from fastapi import FastAPI
from fastapi import File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .defaults import default_scenarios
from .data.bootstrap import build_bootstrapped_market_data
from .data.market_data_sessions import (
    classify_market_data_filename,
    create_market_data_session,
    create_session_from_default_datasets,
    create_session_from_live_sources,
    find_latest_ready_market_data_session,
    get_market_data_session_dir,
    load_market_data_bundle_for_session,
    store_market_data_file,
    summarize_market_data_session,
)
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
    market_data_session_id: str | None = None
    auto_market_data: bool = False


class LiveMarketDataSyncRequest(BaseModel):
    as_of_date: dt.date | None = None
    lookback_days: int = 180


class MarketDataHealthResponse(BaseModel):
    ok: bool
    reason: str
    now: dt.date
    latest_session_id: str | None = None
    latest_session_mtime: dt.datetime | None = None
    age_days: int | None = None
    max_age_days: int = 1


app = FastAPI(title="Option Risk API", version="0.1.0")
logger = logging.getLogger("option_risk.api")


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
        market_session_id = req.market_data_session_id
        auto_market_data = bool(req.auto_market_data)
        auto_market_data_env = os.environ.get("OPTION_RISK_AUTO_MARKET_DATA", "0") == "1"
        use_latest_ready_env = os.environ.get("OPTION_RISK_USE_LATEST_MARKET_DATA", "1") == "1"
        lookback_days_env = int(os.environ.get("OPTION_RISK_AUTO_MARKET_LOOKBACK_DAYS", "180"))

        # В auto-режиме не блокируемся на неготовой/битой вручную выбранной сессии:
        # если session_id есть, но bundle не ready, переходим к авто-подбору ready/live.
        if req.mode == "api" and market_session_id and auto_market_data:
            try:
                explicit_summary = summarize_market_data_session(market_session_id)
            except Exception:
                explicit_summary = None
            if explicit_summary is None or not explicit_summary.ready:
                market_session_id = None

        if req.mode == "api" and not market_session_id and use_latest_ready_env:
            latest = find_latest_ready_market_data_session()
            if latest is not None:
                market_session_id = latest.session_id

        if req.mode == "api" and not market_session_id and (auto_market_data or auto_market_data_env):
            live_summary = create_session_from_live_sources(lookback_days=lookback_days_env)
            market_session_id = live_summary.session_id

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
        market_context = None
        extra_validation_log = []
        if market_session_id:
            bundle, bundle_summary = load_market_data_bundle_for_session(market_session_id)
            bootstrapped_market_data = build_bootstrapped_market_data(bundle, base_currency=req.base_currency)
            market_context = bootstrapped_market_data.market_context
            extra_validation_log = bundle_summary.validation_log + bootstrapped_market_data.validation_log

        result = run_calculation(portfolio, req.scenarios, req.limits, cfg, market=market_context)
        if extra_validation_log:
            result.validation_log = [*extra_validation_log, *result.validation_log]
        return _json_safe(result.__dict__)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/market-data/session")
def create_market_data_upload_session():
    session_id = create_market_data_session()
    return {"session_id": session_id}


@app.get("/market-data/{session_id}")
def get_market_data_session(session_id: str):
    return _json_safe(asdict(summarize_market_data_session(session_id)))


@app.post("/market-data/upload")
async def upload_market_data_file(
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
):
    filename = Path(file.filename or "").name
    if not filename:
        raise HTTPException(status_code=400, detail="Не удалось определить имя файла.")
    if classify_market_data_filename(filename) is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Файл {filename} не распознан как market data bundle. "
                "Поддерживаются curveDiscount, curveForward, fixing, calibrationInstrument*, RC_*."
            ),
        )

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail=f"Файл {filename} пустой.")

    active_session_id = session_id or create_market_data_session()
    summary = store_market_data_file(active_session_id, filename, payload)
    return _json_safe(asdict(summary))


@app.post("/market-data/load-default")
def load_default_market_datasets():
    try:
        summary = create_session_from_default_datasets()
        return _json_safe(asdict(summary))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/market-data/sync-live")
def sync_live_market_data(req: LiveMarketDataSyncRequest):
    try:
        summary = create_session_from_live_sources(
            as_of_date=req.as_of_date,
            lookback_days=req.lookback_days,
        )
        return _json_safe(asdict(summary))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/market-data/health")
def market_data_health(max_age_days: int = 1):
    threshold = max(int(max_age_days), 0)
    latest = find_latest_ready_market_data_session()
    now = dt.datetime.now(dt.timezone.utc)

    if latest is None:
        return MarketDataHealthResponse(
            ok=False,
            reason="no_ready_sessions",
            now=now.date(),
            max_age_days=threshold,
        ).dict()

    session_dir = get_market_data_session_dir(latest.session_id)
    mtime = dt.datetime.fromtimestamp(session_dir.stat().st_mtime, tz=dt.timezone.utc) if session_dir.exists() else None
    age_days = (now.date() - mtime.date()).days if mtime is not None else None
    is_fresh = age_days is not None and age_days <= threshold

    return MarketDataHealthResponse(
        ok=bool(is_fresh),
        reason="ok" if is_fresh else "stale_market_data",
        now=now.date(),
        latest_session_id=latest.session_id,
        latest_session_mtime=mtime,
        age_days=age_days,
        max_age_days=threshold,
    ).dict()


@app.get("/scenarios")
def get_default_scenario_catalog():
    return [scenario.dict() for scenario in default_scenarios()]


@app.get("/health")
def health():
    return {"status": "ok"}
