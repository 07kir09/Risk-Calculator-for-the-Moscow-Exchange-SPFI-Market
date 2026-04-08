from __future__ import annotations

from io import BytesIO

import pandas as pd
import pytest

pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app


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


def test_market_data_upload_rejects_unknown_filename(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    client = TestClient(app)

    resp = client.post(
        "/market-data/upload",
        files={"file": ("portfolio.xlsx", b"test", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 400
    assert "market data bundle" in resp.json()["message"]
