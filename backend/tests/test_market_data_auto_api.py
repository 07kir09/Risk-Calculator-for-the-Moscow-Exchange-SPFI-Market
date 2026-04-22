from __future__ import annotations

import datetime as dt
from pathlib import Path
from types import SimpleNamespace

import pytest

pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app
from option_risk.data.market_data_sessions import MarketDataSessionSummary


def _minimal_metrics_payload() -> dict:
    return {
        "positions": [
            {
                "instrument_type": "forward",
                "position_id": "f1",
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


def test_market_data_health_no_ready_sessions(monkeypatch):
    monkeypatch.setattr("option_risk.api.find_latest_ready_market_data_session", lambda: None)
    client = TestClient(app)

    resp = client.get("/market-data/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["reason"] == "no_ready_sessions"


def test_market_data_health_detects_stale_session(monkeypatch, tmp_path):
    session_id = "abc123"
    summary = MarketDataSessionSummary(session_id=session_id, ready=True)
    session_dir = tmp_path / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    old_ts = dt.datetime.now().timestamp() - 3 * 24 * 3600
    Path(session_dir).touch()
    import os

    os.utime(session_dir, (old_ts, old_ts))

    monkeypatch.setattr("option_risk.api.find_latest_ready_market_data_session", lambda: summary)
    monkeypatch.setattr("option_risk.api.get_market_data_session_dir", lambda _: session_dir)
    client = TestClient(app)

    resp = client.get("/market-data/health?max_age_days=1")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["reason"] == "stale_market_data"
    assert body["latest_session_id"] == session_id
    assert body["age_days"] >= 2


def test_metrics_auto_market_data_sync(monkeypatch):
    called = {"create": 0}

    def _fake_create_session_from_live_sources(*, as_of_date=None, lookback_days=180):
        called["create"] += 1
        return MarketDataSessionSummary(session_id="live-session-1", ready=True)

    def _fake_load_bundle_for_session(session_id: str):
        assert session_id == "live-session-1"
        return None, MarketDataSessionSummary(session_id=session_id, ready=True, validation_log=[], counts={})

    fake_bootstrap = SimpleNamespace(market_context=None, validation_log=[])
    fake_result = SimpleNamespace(
        validation_log=[],
        base_value=0.0,
        var_hist=0.0,
        es_hist=0.0,
        lc_var=0.0,
        worst_stress=0.0,
        correlations=None,
        limits=[],
        config={},
    )

    monkeypatch.setattr("option_risk.api.find_latest_ready_market_data_session", lambda: None)
    monkeypatch.setattr("option_risk.api.create_session_from_live_sources", _fake_create_session_from_live_sources)
    monkeypatch.setattr("option_risk.api.load_market_data_bundle_for_session", _fake_load_bundle_for_session)
    monkeypatch.setattr("option_risk.api.build_bootstrapped_market_data", lambda bundle, base_currency="RUB": fake_bootstrap)
    monkeypatch.setattr("option_risk.api.run_calculation", lambda *args, **kwargs: fake_result)

    client = TestClient(app)
    payload = _minimal_metrics_payload()
    payload["auto_market_data"] = True

    resp = client.post("/metrics", json=payload)
    assert resp.status_code == 200
    assert called["create"] == 1


def test_metrics_auto_market_data_ignores_non_ready_session_id(monkeypatch):
    called = {"create": 0}

    def _fake_create_session_from_live_sources(*, as_of_date=None, lookback_days=180):
        called["create"] += 1
        return MarketDataSessionSummary(session_id="live-session-2", ready=True)

    def _fake_load_bundle_for_session(session_id: str):
        assert session_id == "live-session-2"
        return None, MarketDataSessionSummary(session_id=session_id, ready=True, validation_log=[], counts={})

    fake_bootstrap = SimpleNamespace(market_context=None, validation_log=[])
    fake_result = SimpleNamespace(
        validation_log=[],
        base_value=0.0,
        var_hist=0.0,
        es_hist=0.0,
        lc_var=0.0,
        worst_stress=0.0,
        correlations=None,
        limits=[],
        config={},
    )

    monkeypatch.setattr("option_risk.api.summarize_market_data_session", lambda _: MarketDataSessionSummary(session_id="stale", ready=False, blocking_errors=1))
    monkeypatch.setattr("option_risk.api.find_latest_ready_market_data_session", lambda: None)
    monkeypatch.setattr("option_risk.api.create_session_from_live_sources", _fake_create_session_from_live_sources)
    monkeypatch.setattr("option_risk.api.load_market_data_bundle_for_session", _fake_load_bundle_for_session)
    monkeypatch.setattr("option_risk.api.build_bootstrapped_market_data", lambda bundle, base_currency="RUB": fake_bootstrap)
    monkeypatch.setattr("option_risk.api.run_calculation", lambda *args, **kwargs: fake_result)

    client = TestClient(app)
    payload = _minimal_metrics_payload()
    payload["auto_market_data"] = True
    payload["market_data_session_id"] = "stale-session-id"

    resp = client.post("/metrics", json=payload)
    assert resp.status_code == 200
    assert called["create"] == 1
