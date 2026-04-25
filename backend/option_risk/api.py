"""Простейший FastAPI для расчётов портфеля."""
from __future__ import annotations

import math
import asyncio
import contextlib
import json
import logging
import os
import re
import tempfile
import unicodedata
import urllib.parse
import uuid
import datetime as dt
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any
from zipfile import BadZipFile

from fastapi import Depends, FastAPI
from fastapi import File, Form, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import BaseModel, validator

from .defaults import default_scenarios
from .api_contract import (
    MetricsResponse,
    max_correlation_positions_from_env,
    metrics_should_calculate_correlations,
    resolve_metrics_include,
    validate_limits_config,
)
from .data.bootstrap import build_bootstrapped_market_data
from .data.market_data_completeness import assess_market_data_completeness
from .data.market_data_sessions import (
    classify_market_data_filename,
    create_market_data_session,
    create_session_from_default_datasets,
    create_session_from_live_sources,
    find_latest_ready_market_data_session,
    get_market_data_session_dir,
    load_market_data_bundle_for_session,
    read_market_data_session_metadata,
    summarize_market_data_session,
    validate_market_data_session_id,
    validate_market_data_xlsx_row_limit,
)
from .data.live_market_data import clamp_lookback_days
from .data.models import MarketScenario, OptionPosition, Portfolio
from .risk.pipeline import CalculationConfig, run_calculation


class PortfolioRequest(BaseModel):
    positions: list[OptionPosition]
    scenarios: list[MarketScenario]
    limits: dict | None = None
    include: list[str] | str | None = None
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
    calc_correlations: bool | None = None
    market_data_session_id: str | None = None
    auto_market_data: bool = False

    @validator("limits", pre=True)
    def _validate_limits(cls, value):
        return validate_limits_config(value)


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


TRAVERSAL_INPUT_MESSAGE = "Недопустимое значение: path traversal запрещён."
_MAX_URL_DECODE_PASSES = 5
_PATH_LIKE_FIELD_NAMES = {"filename", "path", "session_id"}
_PATH_LIKE_FIELD_SUFFIXES = ("_filename", "_path", "_session_id")
_SLASH_TRANSLATION = str.maketrans(
    {
        "\u2044": "/",
        "\u2215": "/",
        "\u29f8": "/",
        "\ufe68": "\\",
    }
)


def _normalize_path_probe(value: str) -> str:
    normalized = value
    for _ in range(_MAX_URL_DECODE_PASSES):
        decoded = urllib.parse.unquote(normalized)
        decoded = unicodedata.normalize("NFKC", decoded).translate(_SLASH_TRANSLATION)
        if decoded == normalized:
            break
        normalized = decoded
    return normalized.replace("\\", "/")


def _has_path_traversal(value: str) -> bool:
    normalized = _normalize_path_probe(value)
    return any(segment == ".." for segment in re.split(r"/+", normalized))


def _is_path_like_field(field_name: str) -> bool:
    normalized = field_name.lower().replace("-", "_")
    return normalized in _PATH_LIKE_FIELD_NAMES or normalized.endswith(_PATH_LIKE_FIELD_SUFFIXES)


def _iter_path_like_payload_values(value: Any, *, field_name: str | None = None):
    if isinstance(value, dict):
        for key, item in value.items():
            yield from _iter_path_like_payload_values(item, field_name=str(key))
        return
    if isinstance(value, list):
        for item in value:
            yield from _iter_path_like_payload_values(item, field_name=field_name)
        return
    if isinstance(value, str) and field_name is not None and _is_path_like_field(field_name):
        yield value


def _validate_no_path_traversal(values) -> None:
    for value in values:
        if isinstance(value, str) and _has_path_traversal(value):
            raise HTTPException(status_code=400, detail=TRAVERSAL_INPUT_MESSAGE)


async def reject_path_traversal_inputs(request: Request) -> None:
    _validate_no_path_traversal(request.path_params.values())
    _validate_no_path_traversal(value for _, value in request.query_params.multi_items())

    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type == "application/json":
        body = await request.body()
        if not body:
            return
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return
        _validate_no_path_traversal(_iter_path_like_payload_values(payload))
        return

    if content_type in {"application/x-www-form-urlencoded", "multipart/form-data"}:
        form = await request.form()
        _validate_no_path_traversal(
            value
            for key, value in form.multi_items()
            if _is_path_like_field(key) and isinstance(value, str)
        )


def _http_error_response(request: Request, status_code: int, message: str) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    trace_id = getattr(request.state, "trace_id", None)
    response = JSONResponse(
        status_code=status_code,
        content={
            "code": "http_error",
            "message": message,
            "requestId": request_id,
            "traceId": trace_id,
        },
    )
    if request_id is not None:
        response.headers["x-request-id"] = request_id
    if trace_id is not None:
        response.headers["x-trace-id"] = trace_id
    return response


def _raw_url_values(request: Request) -> list[str]:
    raw_path = request.scope.get("raw_path") or request.url.path.encode()
    query_string = request.scope.get("query_string") or b""
    return [
        raw_path.decode("latin-1", errors="ignore"),
        query_string.decode("latin-1", errors="ignore"),
    ]


app = FastAPI(title="Option Risk API", version="0.1.0", dependencies=[Depends(reject_path_traversal_inputs)])
logger = logging.getLogger("option_risk.api")
_NO_READY_MARKET_DATA_MESSAGE = "Нет готовых market-data сессий"

DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_UPLOAD_BYTES_ENV = "OPTION_RISK_MAX_UPLOAD_BYTES"
MAX_UPLOAD_MB_ENV = "OPTION_RISK_MAX_UPLOAD_SIZE_MB"
UPLOAD_CHUNK_SIZE_BYTES = 1024 * 1024
_DEFAULT_CORS_ORIGINS = ("http://localhost", "http://127.0.0.1")
_DEV_LOCALHOST_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
_DEFAULT_AUTO_MARKET_LOOKBACK_DAYS = 180
_MAX_LOOKBACK_DAYS = 365


def _parse_csv_env_list(name: str, default: tuple[str, ...]) -> list[str]:
    raw = os.environ.get(name, "")
    values = [item.strip() for item in raw.split(",") if item.strip() and item.strip() != "*"]
    return values or list(default)


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("invalid_int_env name=%s value=%r fallback=%s", name, raw, default)
        return default


def _coerce_lookback_days(value: int) -> int:
    return min(clamp_lookback_days(value), _MAX_LOOKBACK_DAYS)


app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_csv_env_list("OPTION_RISK_CORS_ALLOW_ORIGINS", _DEFAULT_CORS_ORIGINS),
    allow_origin_regex=_DEV_LOCALHOST_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _json_safe(value):
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Расчёт дал нечисловое значение (NaN/Inf); проверьте входные параметры портфеля и market-data.")
        return value
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if is_dataclass(value):
        return _json_safe(asdict(value))
    return value


def _max_upload_bytes() -> int:
    raw_value = os.environ.get(MAX_UPLOAD_BYTES_ENV)
    if raw_value is None:
        raw_mb = os.environ.get(MAX_UPLOAD_MB_ENV)
        if raw_mb is not None:
            try:
                parsed_mb = int(raw_mb)
            except ValueError:
                logger.warning("invalid_max_upload_mb value=%r fallback=%s", raw_mb, DEFAULT_MAX_UPLOAD_BYTES)
                return DEFAULT_MAX_UPLOAD_BYTES
            if parsed_mb < 1:
                logger.warning("non_positive_max_upload_mb value=%s fallback=%s", parsed_mb, DEFAULT_MAX_UPLOAD_BYTES)
                return DEFAULT_MAX_UPLOAD_BYTES
            return parsed_mb * 1024 * 1024
    if raw_value is None:
        return DEFAULT_MAX_UPLOAD_BYTES
    try:
        parsed = int(raw_value)
    except ValueError:
        logger.warning("invalid_max_upload_bytes value=%r fallback=%s", raw_value, DEFAULT_MAX_UPLOAD_BYTES)
        return DEFAULT_MAX_UPLOAD_BYTES
    if parsed < 1:
        logger.warning("non_positive_max_upload_bytes value=%s fallback=%s", parsed, DEFAULT_MAX_UPLOAD_BYTES)
        return DEFAULT_MAX_UPLOAD_BYTES
    return parsed


async def _stream_upload_to_tempfile(file: UploadFile, *, max_bytes: int, suffix: str = "") -> tuple[Path, int]:
    total_size = 0
    temp_file = tempfile.NamedTemporaryFile(prefix="option-risk-upload-", suffix=suffix, delete=False)
    temp_path = Path(temp_file.name)

    try:
        with temp_file:
            while True:
                chunk = await file.read(UPLOAD_CHUNK_SIZE_BYTES)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > max_bytes:
                    raise HTTPException(status_code=413, detail=f"Файл превышает максимальный размер {max_bytes} байт.")
                await asyncio.to_thread(temp_file.write, chunk)
    except Exception:
        with contextlib.suppress(FileNotFoundError):
            temp_path.unlink()
        raise

    return temp_path, total_size


def _store_uploaded_market_data_file(session_id: str, filename: str, source_path: Path):
    safe_name = Path(filename).name
    if classify_market_data_filename(safe_name) is None:
        raise ValueError(
            "Файл не распознан как market data bundle. Поддерживаются curveDiscount, curveForward, fixing, calibrationInstrument*, RC_*. "
        )

    session_dir = get_market_data_session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    validate_market_data_xlsx_row_limit(safe_name, source_path)
    os.replace(source_path, session_dir / safe_name)
    return summarize_market_data_session(session_id)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    trace_id = str(uuid.uuid4())
    request.state.request_id = request_id
    request.state.trace_id = trace_id

    if any(_has_path_traversal(value) for value in _raw_url_values(request)):
        return _http_error_response(request, 400, TRAVERSAL_INPUT_MESSAGE)

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
    if isinstance(exc.detail, dict):
        content = {
            "code": "http_error",
            **exc.detail,
            "message": exc.detail.get("message", str(exc.detail)),
            "requestId": getattr(request.state, "request_id", None),
            "traceId": getattr(request.state, "trace_id", None),
        }
        return JSONResponse(status_code=exc.status_code, content=content)
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
            "requestId": getattr(request.state, "request_id", None),
            "traceId": getattr(request.state, "trace_id", None),
        },
    )


@app.post("/metrics", response_model=MetricsResponse)
def compute_metrics(req: PortfolioRequest, include: list[str] | None = Query(default=None)):
    try:
        effective_include = resolve_metrics_include(req.include, include)
        calc_correlations = metrics_should_calculate_correlations(req.calc_correlations, effective_include)
        market_session_id = req.market_data_session_id
        auto_market_data = bool(req.auto_market_data)
        auto_market_data_env = os.environ.get("OPTION_RISK_AUTO_MARKET_DATA", "0") == "1"
        use_latest_ready_env = os.environ.get("OPTION_RISK_USE_LATEST_MARKET_DATA", "1") == "1"
        lookback_days_env = _coerce_lookback_days(
            _env_int("OPTION_RISK_AUTO_MARKET_LOOKBACK_DAYS", _DEFAULT_AUTO_MARKET_LOOKBACK_DAYS)
        )
        latest_ready_lookup_attempted = False

        # В auto-режиме не блокируемся на неготовой/битой вручную выбранной сессии:
        # если session_id есть, но bundle не ready, переходим к авто-подбору ready/live.
        if req.mode == "api" and market_session_id and auto_market_data:
            try:
                explicit_summary = summarize_market_data_session(market_session_id)
            except Exception:
                explicit_summary = None
            if explicit_summary is None or not explicit_summary.ready:
                market_session_id = None

        if req.mode == "api" and not market_session_id and (auto_market_data or auto_market_data_env):
            try:
                live_summary = create_session_from_live_sources(lookback_days=lookback_days_env)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            except RuntimeError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            market_session_id = live_summary.session_id

        if req.mode == "api" and not market_session_id and use_latest_ready_env:
            latest_ready_lookup_attempted = True
            latest = find_latest_ready_market_data_session()
            if latest is not None:
                market_session_id = latest.session_id

        if (
            req.mode == "api"
            and not market_session_id
            and latest_ready_lookup_attempted
            and not (auto_market_data or auto_market_data_env)
        ):
            raise HTTPException(status_code=404, detail="Нет готовых market-data sessions. Загрузите market-data bundle или включите auto_market_data.")

        portfolio = Portfolio(positions=req.positions)
        cfg = CalculationConfig(
            calc_sensitivities=req.calc_sensitivities,
            calc_var_es=req.calc_var_es,
            calc_stress=req.calc_stress,
            calc_margin_capital=req.calc_margin_capital,
            calc_correlations=calc_correlations,
            max_correlation_positions=max_correlation_positions_from_env(),
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
        market_data_metadata: dict[str, object] = {}
        if market_session_id:
            market_data_metadata = read_market_data_session_metadata(market_session_id)
            try:
                bundle, bundle_summary = load_market_data_bundle_for_session(market_session_id)
            except (BadZipFile, InvalidFileException, KeyError, ValueError) as exc:
                logger.warning(
                    "metrics_market_data_session_unavailable session_id=%s error_type=%s error=%s",
                    market_session_id,
                    type(exc).__name__,
                    exc,
                )
                raise HTTPException(status_code=422, detail=_NO_READY_MARKET_DATA_MESSAGE) from exc
            except Exception as exc:
                logger.warning(
                    "metrics_market_data_session_unavailable session_id=%s error_type=%s error=%s",
                    market_session_id,
                    type(exc).__name__,
                    exc,
                )
                raise HTTPException(status_code=422, detail=_NO_READY_MARKET_DATA_MESSAGE) from exc
            bootstrapped_market_data = build_bootstrapped_market_data(bundle, base_currency=req.base_currency)
            market_context = bootstrapped_market_data.market_context
            extra_validation_log = bundle_summary.validation_log + bootstrapped_market_data.validation_log
            completeness = assess_market_data_completeness(
                portfolio,
                market_context,
                upstream_warnings=extra_validation_log,
            )
            if req.mode == "api" and not completeness.is_complete:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "message": "Недостаточно market-data для полного расчёта портфеля",
                        "calculation_status": "blocked",
                        "market_data_completeness": "incomplete",
                        "missing_curves": completeness.missing_curves,
                        "affected_positions": completeness.affected_positions,
                        "required_market_data": completeness.required_market_data,
                        "data_quality": completeness.to_data_quality(),
                        "next_step": (
                            "Загрузите market-data bundle с нужными discount/forward curves "
                            "или используйте demo/default source только как preliminary preview."
                        ),
                    },
                )

        result = run_calculation(portfolio, req.scenarios, req.limits, cfg, market=market_context)
        if extra_validation_log:
            result.validation_log = [*extra_validation_log, *result.validation_log]
        payload = dict(result.__dict__)
        payload.update(
            {
                "calculation_status": "complete",
                "data_quality": {
                    "market_data_completeness": "complete",
                    "missing_curves": [],
                    "missing_fx": [],
                    "affected_positions": [],
                    "partial_positions_count": 0,
                    "warnings": [],
                },
                "market_data_completeness": "complete",
                "market_data_source": (
                    str(market_data_metadata.get("market_data_source"))
                    if market_data_metadata.get("market_data_source")
                    else ("market_data_session" if market_session_id else None)
                ),
                "methodology_status": (
                    str(market_data_metadata.get("methodology_status"))
                    if market_data_metadata.get("methodology_status")
                    else ("preliminary" if req.mode == "demo" else "production_inputs")
                ),
                "valuation_label": "Net PV / MtM",
                "var_method": "scenario_quantile",
            }
        )
        return _json_safe(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/market-data/session")
def create_market_data_upload_session():
    session_id = create_market_data_session()
    return {"session_id": session_id}


@app.post("/market-data/upload")
async def upload_market_data_file(
    file: UploadFile = File(...),
    session_id: str | None = Form(default=None),
):
    if session_id is not None:
        try:
            session_id = validate_market_data_session_id(session_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

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

    temp_path, size_bytes = await _stream_upload_to_tempfile(file, max_bytes=_max_upload_bytes(), suffix=Path(filename).suffix)
    if size_bytes == 0:
        with contextlib.suppress(FileNotFoundError):
            temp_path.unlink()
        raise HTTPException(status_code=400, detail=f"Файл {filename} пустой.")

    active_session_id = session_id or create_market_data_session()
    try:
        summary = await asyncio.to_thread(_store_uploaded_market_data_file, active_session_id, filename, temp_path)
        return _json_safe(asdict(summary))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        with contextlib.suppress(FileNotFoundError):
            temp_path.unlink()


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
            lookback_days=_coerce_lookback_days(req.lookback_days),
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


@app.get("/market-data/{session_id}")
def get_market_data_session(session_id: str):
    try:
        session_id = validate_market_data_session_id(session_id)
        return _json_safe(asdict(summarize_market_data_session(session_id)))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/scenarios")
def get_default_scenario_catalog():
    return [scenario.dict() for scenario in default_scenarios()]


@app.get("/limits")
def get_default_limits_catalog():
    return {
        "var_hist": 5_000.0,
        "es_hist": 6_500.0,
        "lc_var": 7_500.0,
        "stress": {
            scenario.scenario_id: 9_000.0
            for scenario in default_scenarios()
            if scenario.underlying_shift != 0 or scenario.volatility_shift != 0 or scenario.rate_shift != 0
        },
    }


@app.get("/health")
def health():
    return {"status": "ok"}
