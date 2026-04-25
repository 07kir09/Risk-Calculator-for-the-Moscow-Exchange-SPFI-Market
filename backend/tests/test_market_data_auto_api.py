from __future__ import annotations

import datetime as dt
import os
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app
from option_risk.data.bootstrap import build_bootstrapped_market_data
from option_risk.data.live_market_data import sync_live_market_data_to_directory
from option_risk.data.market_data import load_market_data_bundle_from_directory
from option_risk.data.market_data_sessions import MarketDataSessionSummary


def _write_xlsx(path: Path, rows: list[dict]) -> None:
    buf = BytesIO()
    pd.DataFrame(rows).to_excel(buf, index=False)
    path.write_bytes(buf.getvalue())


def _write_minimal_ready_bundle(session_dir: Path) -> None:
    session_dir.mkdir(parents=True, exist_ok=True)
    _write_xlsx(
        session_dir / "curveDiscount.xlsx",
        [
            {
                "Дата": "2025-09-01",
                "Кривая": "RUB-DISCOUNT-RUB-CSA",
                "Тип": "Дисконтная",
                "Дисконт фактор": "1W",
                "Тенор": 0.0192,
                "Ставка": 0.99658838,
            }
        ],
    )
    _write_xlsx(
        session_dir / "curveForward.xlsx",
        [
            {
                "Дата": "2025-09-01",
                "Кривая": "RUB-RUSFAR-OIS-COMPOUND",
                "Тип": "Форвардная",
                "Срок": "1W",
                "Тенор": 0.0192,
                "Ставка": 0.1766,
            }
        ],
    )
    _write_xlsx(
        session_dir / "fixing.xlsx",
        [{"Индекс": "RUONIA Avg.", "Фиксинг": 0.1479, "Дата": "2025-09-01"}],
    )


def _write_poisoned_bundle(session_dir: Path) -> None:
    session_dir.mkdir(parents=True, exist_ok=True)
    (session_dir / "curveDiscount.xlsx").write_bytes(b"not-a-zip")


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


def test_live_market_data_sync_builds_non_rub_curves(monkeypatch, tmp_path):
    dates = [dt.date(2026, 4, 23), dt.date(2026, 4, 24)]
    monkeypatch.setattr(
        "option_risk.data.live_market_data._fetch_cbr_key_rate",
        lambda start, end: pd.DataFrame({"date": dates, "rate": [0.145, 0.144]}),
    )
    monkeypatch.setattr(
        "option_risk.data.live_market_data._fetch_cbr_ruonia",
        lambda start, end: pd.DataFrame({"date": dates, "rate": [0.142, 0.143]}),
    )
    monkeypatch.setattr(
        "option_risk.data.live_market_data._build_fx_frames",
        lambda start, end, currencies: {
            "USD": pd.DataFrame({"currency_code": ["USD"], "currency_label": ["USD"], "nominal": [1.0], "obs_date": [dates[-1]], "rate": [90.0]}),
            "EUR": pd.DataFrame({"currency_code": ["EUR"], "currency_label": ["EUR"], "nominal": [1.0], "obs_date": [dates[-1]], "rate": [100.0]}),
            "CNY": pd.DataFrame({"currency_code": ["CNY"], "currency_label": ["CNY"], "nominal": [1.0], "obs_date": [dates[-1]], "rate": [12.0]}),
        },
    )
    monkeypatch.setattr(
        "option_risk.data.live_market_data._fetch_external_rate_histories",
        lambda start, end: {
            "USD": pd.DataFrame({"date": dates, "rate": [0.0364, 0.0365]}),
            "EUR": pd.DataFrame({"date": dates, "rate": [0.0192, 0.0191]}),
            "CNY": pd.DataFrame({"date": dates, "rate": [0.0021, 0.0019]}),
        },
    )

    stats = sync_live_market_data_to_directory(tmp_path, as_of_date=dt.date(2026, 4, 25), lookback_days=30)
    bundle = load_market_data_bundle_from_directory(tmp_path, strict=False)
    bootstrapped = build_bootstrapped_market_data(bundle)

    assert stats.external_curve_currencies == ("CNY", "EUR", "USD")
    assert {"USD-DISCOUNT-USD-CSA", "EUR-DISCOUNT-EUR-CSA", "CNY-DISCOUNT-CNY-CSA"}.issubset(
        bootstrapped.market_context.discount_curves
    )
    assert {"USD-SOFR", "USD-OISFX", "EUR-ESTR", "EUR-EURIBOR-Act/365-3M", "CNY-RUSFARCNY-OIS-COMPOUND"}.issubset(
        bootstrapped.market_context.forward_curves
    )
    assert not [message for message in bootstrapped.validation_log if "не найдена discount curve" in message.message]
    assert (tmp_path / "marketDataMetadata.json").exists()


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
        return MarketDataSessionSummary(session_id="1" * 32, ready=True)

    def _fake_load_bundle_for_session(session_id: str):
        assert session_id == "1" * 32
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


def test_metrics_auto_market_data_prefers_live_sync_over_latest_ready(monkeypatch):
    called = {"create": 0, "latest": 0}

    def _fake_create_session_from_live_sources(*, as_of_date=None, lookback_days=180):
        called["create"] += 1
        return MarketDataSessionSummary(session_id="4" * 32, ready=True)

    def _fake_latest_ready():
        called["latest"] += 1
        return MarketDataSessionSummary(session_id="5" * 32, ready=True)

    def _fake_load_bundle_for_session(session_id: str):
        assert session_id == "4" * 32
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

    monkeypatch.setattr("option_risk.api.find_latest_ready_market_data_session", _fake_latest_ready)
    monkeypatch.setattr("option_risk.api.create_session_from_live_sources", _fake_create_session_from_live_sources)
    monkeypatch.setattr("option_risk.api.load_market_data_bundle_for_session", _fake_load_bundle_for_session)
    monkeypatch.setattr("option_risk.api.build_bootstrapped_market_data", lambda bundle, base_currency="RUB": fake_bootstrap)
    monkeypatch.setattr("option_risk.api.run_calculation", lambda *args, **kwargs: fake_result)

    client = TestClient(app)
    payload = _minimal_metrics_payload()
    payload["auto_market_data"] = True

    resp = client.post("/metrics", json=payload)

    assert resp.status_code == 200
    assert called == {"create": 1, "latest": 0}


def test_metrics_auto_market_data_ignores_non_ready_session_id(monkeypatch):
    called = {"create": 0}

    def _fake_create_session_from_live_sources(*, as_of_date=None, lookback_days=180):
        called["create"] += 1
        return MarketDataSessionSummary(session_id="2" * 32, ready=True)

    def _fake_load_bundle_for_session(session_id: str):
        assert session_id == "2" * 32
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
    payload["market_data_session_id"] = "3" * 32

    resp = client.post("/metrics", json=payload)
    assert resp.status_code == 200
    assert called["create"] == 1


def test_metrics_skips_poisoned_latest_session_and_uses_older_ready(monkeypatch, tmp_path):
    sessions_root = tmp_path / "sessions"
    older_ready_id = "a" * 32
    newer_poisoned_id = "b" * 32
    older_ready_dir = sessions_root / older_ready_id
    newer_poisoned_dir = sessions_root / newer_poisoned_id
    _write_minimal_ready_bundle(older_ready_dir)
    _write_poisoned_bundle(newer_poisoned_dir)
    os.utime(older_ready_dir, (1000, 1000))
    os.utime(newer_poisoned_dir, (2000, 2000))

    loaded_sessions: list[str] = []
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

    def _fake_load_bundle_for_session(session_id: str):
        loaded_sessions.append(session_id)
        return None, MarketDataSessionSummary(session_id=session_id, ready=True, validation_log=[], counts={})

    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(sessions_root))
    monkeypatch.setattr("option_risk.api.load_market_data_bundle_for_session", _fake_load_bundle_for_session)
    monkeypatch.setattr("option_risk.api.build_bootstrapped_market_data", lambda bundle, base_currency="RUB": fake_bootstrap)
    monkeypatch.setattr("option_risk.api.run_calculation", lambda *args, **kwargs: fake_result)

    client = TestClient(app)
    resp = client.post("/metrics", json=_minimal_metrics_payload())

    assert resp.status_code == 200
    assert loaded_sessions == [older_ready_id]


def test_metrics_returns_clean_error_for_explicit_poisoned_session(monkeypatch, tmp_path):
    sessions_root = tmp_path / "sessions"
    poisoned_id = "c" * 32
    _write_poisoned_bundle(sessions_root / poisoned_id)

    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(sessions_root))
    client = TestClient(app)
    payload = _minimal_metrics_payload()
    payload["market_data_session_id"] = poisoned_id

    resp = client.post("/metrics", json=payload)

    assert resp.status_code == 422
    assert resp.json()["message"] == "Нет готовых market-data сессий"
