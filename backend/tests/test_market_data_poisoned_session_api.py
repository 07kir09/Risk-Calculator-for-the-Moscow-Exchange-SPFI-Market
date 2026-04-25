from __future__ import annotations

import logging
import os
import time
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pytest
from openpyxl import Workbook

pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app
from option_risk.data.market_data_sessions import MarketDataSessionSummary


def _xlsx_bytes(headers: list[str], rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Sheet1"
    worksheet.append(headers)
    for row in rows:
        worksheet.append(row)
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _write_valid_bundle(session_dir: Path) -> None:
    session_dir.mkdir(parents=True, exist_ok=True)
    discount = _xlsx_bytes(
        ["Дата", "Кривая", "Тип", "Дисконт фактор", "Тенор", "Ставка"],
        [["2026-01-01", "RUB-DISCOUNT-RUB-CSA", "Дисконтная", 0.99, 0.5, 0.17]],
    )
    forward = _xlsx_bytes(
        ["Дата", "Кривая", "Тип", "Срок", "Тенор", "Ставка"],
        [["2026-01-01", "RUB-FORWARD-RUB-CSA", "Форвардная", "6M", 0.5, 0.2]],
    )
    fixing = _xlsx_bytes(
        ["Индекс", "Фиксинг", "Дата"],
        [["USD_SOFR", 0.05, "2026-01-01"]],
    )
    (session_dir / "curveDiscount.xlsx").write_bytes(discount)
    (session_dir / "curveForward.xlsx").write_bytes(forward)
    (session_dir / "fixing.xlsx").write_bytes(fixing)


def _write_poisoned_bundle(session_dir: Path) -> None:
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "curveDiscount.xlsx").write_bytes(b"not a zip archive")


def _metrics_payload() -> dict:
    return {
        "positions": [
            {
                "instrument_type": "forward",
                "position_id": "p1",
                "option_type": "call",
                "style": "european",
                "quantity": 1,
                "notional": 1,
                "underlying_symbol": "A",
                "underlying_price": 100,
                "strike": 100,
                "volatility": 0.0,
                "maturity_date": "2026-12-31",
                "valuation_date": "2026-01-01",
                "risk_free_rate": 0.05,
                "dividend_yield": 0.0,
                "currency": "RUB",
                "liquidity_haircut": 0.0,
            }
        ],
        "scenarios": [{"scenario_id": "s1", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0}],
        "alpha": 0.99,
        "horizon_days": 10,
        "base_currency": "RUB",
        "liquidity_model": "fraction_of_position_value",
        "mode": "api",
        "calc_sensitivities": True,
        "calc_var_es": True,
        "calc_stress": True,
        "calc_margin_capital": True,
    }


def test_metrics_returns_404_for_poisoned_latest_session_only(monkeypatch, tmp_path, caplog):
    sessions_root = tmp_path / "sessions"
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(sessions_root))
    bad_session_id = "b" * 32
    bad_dir = sessions_root / bad_session_id
    _write_poisoned_bundle(bad_dir)
    now = time.time()
    os.utime(bad_dir, (now, now))

    client = TestClient(app)
    with caplog.at_level(logging.WARNING, logger="option_risk.data.market_data_sessions"):
        resp = client.post("/metrics", json=_metrics_payload())

    assert resp.status_code == 404
    assert "Нет готовых market-data sessions" in resp.json()["message"]
    assert bad_session_id in caplog.text
    assert "BadZipFile" in caplog.text or "badzipfile" in caplog.text.lower() or "ValueError" in caplog.text


def test_metrics_skips_poisoned_session_and_uses_valid_latest(monkeypatch, tmp_path, caplog):
    sessions_root = tmp_path / "sessions"
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(sessions_root))

    valid_session_id = "a" * 32
    bad_session_id = "b" * 32
    valid_dir = sessions_root / valid_session_id
    bad_dir = sessions_root / bad_session_id

    _write_valid_bundle(valid_dir)
    _write_poisoned_bundle(bad_dir)

    older = time.time() - 3600
    newer = time.time()
    os.utime(valid_dir, (older, older))
    os.utime(bad_dir, (newer, newer))

    observed: dict[str, str | None] = {"session_id": None}

    def _fake_load_market_data_bundle_for_session(session_id: str):
        observed["session_id"] = session_id
        summary = MarketDataSessionSummary(session_id=session_id, ready=True, validation_log=[], counts={})
        return SimpleNamespace(), summary

    fake_bootstrap = SimpleNamespace(market_context="ctx", validation_log=[])
    fake_result = SimpleNamespace(
        validation_log=[],
        base_value=0.0,
        var_hist=0.0,
        es_hist=0.0,
        var_param=None,
        es_param=None,
        lc_var=0.0,
        lc_var_addon=None,
        lc_var_breakdown=None,
        greeks=None,
        stress=None,
        top_contributors=None,
        limits=[],
        correlations=None,
        pnl_matrix=None,
        pnl_distribution=None,
        buckets=None,
        base_currency="RUB",
        confidence_level=0.99,
        horizon_days=10,
        parametric_tail_model="normal",
        mode="api",
        methodology_note=None,
        fx_warning=None,
        liquidity_model="fraction_of_position_value",
        capital=None,
        initial_margin=None,
        variation_margin=None,
    )

    monkeypatch.setattr("option_risk.api.load_market_data_bundle_for_session", _fake_load_market_data_bundle_for_session)
    monkeypatch.setattr("option_risk.api.build_bootstrapped_market_data", lambda bundle, base_currency="RUB": fake_bootstrap)
    monkeypatch.setattr("option_risk.api.run_calculation", lambda *args, **kwargs: fake_result)

    client = TestClient(app)
    with caplog.at_level(logging.WARNING, logger="option_risk.data.market_data_sessions"):
        resp = client.post("/metrics", json=_metrics_payload())

    assert resp.status_code == 200
    assert observed["session_id"] == valid_session_id
    assert bad_session_id in caplog.text
    assert "BadZipFile" in caplog.text or "badzipfile" in caplog.text.lower() or "ValueError" in caplog.text
