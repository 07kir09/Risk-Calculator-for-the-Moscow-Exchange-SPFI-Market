from __future__ import annotations

import asyncio
from io import BytesIO
import threading
import time

import pandas as pd
import pytest

httpx = pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

import option_risk.api as api
from option_risk.api import app
from option_risk.data.market_data_sessions import MarketDataSessionSummary


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _excel_bytes(df: pd.DataFrame) -> bytes:
    buf = BytesIO()
    df.to_excel(buf, index=False)
    return buf.getvalue()


def test_market_data_upload_builds_ready_bundle(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    client = TestClient(app)

    discount_bytes = _excel_bytes(
        pd.DataFrame(
            [
                {
                    "Дата": "2025-09-01",
                    "Кривая": "RUB-DISCOUNT-RUB-CSA",
                    "Тип": "Дисконтная",
                    "Дисконт фактор": "1W",
                    "Тенор": 0.0192,
                    "Ставка": 0.99658838,
                }
            ]
        )
    )
    forward_bytes = _excel_bytes(
        pd.DataFrame(
            [
                {
                    "Дата": "2025-09-01",
                    "Кривая": "RUB-RUSFAR-OIS-COMPOUND",
                    "Тип": "Форвардная",
                    "Срок": "1W",
                    "Тенор": 0.0192,
                    "Ставка": 0.1766,
                }
            ]
        )
    )
    fixing_bytes = _excel_bytes(pd.DataFrame([{"Индекс": "RUONIA Avg.", "Фиксинг": 0.1479, "Дата": "2025-09-01"}]))

    resp = client.post(
        "/market-data/upload",
        files={"file": ("curveDiscount.xlsx", discount_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 200
    first = resp.json()
    assert first["files"][0]["kind"] == "curve_discount"
    session_id = first["session_id"]
    assert "curveForward.xlsx" in first["missing_required_files"]

    resp = client.post(
        "/market-data/upload",
        data={"session_id": session_id},
        files={"file": ("curveForward.xlsx", forward_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 200

    resp = client.post(
        "/market-data/upload",
        data={"session_id": session_id},
        files={"file": ("fixing.xlsx", fixing_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ready"] is True
    assert payload["blocking_errors"] == 0
    assert payload["counts"]["discount_curves"] == 1
    assert payload["counts"]["forward_curves"] == 1
    assert payload["counts"]["fixings"] == 1


def test_market_data_upload_accepts_generic_fx_table(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    client = TestClient(app)

    fx_bytes = _excel_bytes(
        pd.DataFrame(
            [
                {"pair": "USD/RUB", "date": "2026-04-25", "rate": 92.5, "nominal": 1},
                {"pair": "EUR/RUB", "date": "2026-04-25", "rate": 100.1, "nominal": 1},
            ]
        )
    )

    resp = client.post(
        "/market-data/upload",
        files={"file": ("market_data_fx_full.xlsx", fx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["files"][0]["kind"] == "fx_history"
    assert payload["counts"]["fx_history"] == 2
    assert payload["available_fx_pairs"] == ["EUR/RUB", "USD/RUB"]


def test_market_data_upload_rejects_unknown_filename(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    client = TestClient(app)

    resp = client.post(
        "/market-data/upload",
        files={"file": ("portfolio.xlsx", b"test", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 400
    assert "market data bundle" in resp.json()["message"]


def test_market_data_upload_rejects_file_over_max_upload_bytes(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    monkeypatch.setenv("OPTION_RISK_MAX_UPLOAD_BYTES", "10")
    client = TestClient(app)

    resp = client.post(
        "/market-data/upload",
        files={"file": ("curveDiscount.xlsx", b"x" * 11, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 413


@pytest.mark.anyio
async def test_market_data_health_responds_during_upload_processing(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    monkeypatch.setattr("option_risk.api.find_latest_ready_market_data_session", lambda: None)
    started = threading.Event()

    def _slow_store(session_id: str, filename: str, source_path):
        started.set()
        time.sleep(0.75)
        return MarketDataSessionSummary(session_id=session_id)

    monkeypatch.setattr(api, "_store_uploaded_market_data_file", _slow_store)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        upload_task = asyncio.create_task(
            client.post(
                "/market-data/upload",
                files={
                    "file": (
                        "curveDiscount.xlsx",
                        _excel_bytes(pd.DataFrame([{"Дата": "2025-09-01"}])),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )
        )

        assert await asyncio.to_thread(started.wait, 1.0)
        assert not upload_task.done()

        start = time.perf_counter()
        health_resp = await client.get("/market-data/health")
        elapsed = time.perf_counter() - start

        upload_resp = await upload_task

    assert health_resp.status_code == 200
    assert elapsed < 0.5
    assert upload_resp.status_code == 200
