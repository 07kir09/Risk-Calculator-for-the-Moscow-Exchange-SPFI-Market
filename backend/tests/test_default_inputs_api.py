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


def test_scenarios_endpoint_returns_rates_and_fx_default_catalog():
    client = TestClient(app)

    resp = client.get("/scenarios")

    assert resp.status_code == 200
    payload = resp.json()
    assert len(payload) == 7
    assert any(item["scenario_id"] == "base" for item in payload)
    assert any(item["rate_shift"] > 0 for item in payload)
    assert any(item["rate_shift"] < 0 for item in payload)
    assert any((item.get("fx_spot_shifts") or {}).get("USD", 0) > 0 for item in payload)
    assert any((item.get("fx_spot_shifts") or {}).get("EUR", 0) < 0 for item in payload)
    assert all(not item["scenario_id"].startswith("shock_") for item in payload)


def test_limits_endpoint_returns_default_limits_catalog():
    client = TestClient(app)

    resp = client.get("/limits")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["var_hist"] > 0
    assert payload["es_hist"] > payload["var_hist"]
    assert payload["lc_var"] > 0
    assert isinstance(payload["stress"], dict)
    assert payload["stress"]


def test_market_data_load_default_uses_configured_datasets_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    monkeypatch.setenv("OPTION_RISK_DEFAULT_DATASETS_DIR", str(tmp_path / "datasets"))

    datasets_dir = tmp_path / "datasets"
    datasets_dir.mkdir(parents=True, exist_ok=True)

    (datasets_dir / "curveDiscount.xlsx").write_bytes(
        _excel_bytes(
            pd.DataFrame(
                [
                    {
                        "Дата": "2025-09-01",
                        "Кривая": "RUB-DISCOUNT-RUB-CSA",
                        "Тип": "Дисконтная",
                        "Дисконт фактор": 0.9965,
                        "Тенор": 0.0192,
                        "Ставка": 0.9965,
                    }
                ]
            )
        )
    )
    (datasets_dir / "curveForward.xlsx").write_bytes(
        _excel_bytes(
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
    )
    (datasets_dir / "fixing.xlsx").write_bytes(
        _excel_bytes(pd.DataFrame([{"Индекс": "RUONIA Avg.", "Фиксинг": 0.1479, "Дата": "2025-09-01"}]))
    )

    client = TestClient(app)
    resp = client.post("/market-data/load-default")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ready"] is True
    assert payload["blocking_errors"] == 0
    assert payload["counts"]["discount_curves"] == 1
    assert payload["counts"]["forward_curves"] == 1
    assert payload["counts"]["fixings"] == 1


def test_market_data_load_default_accepts_trusted_bundled_datasets(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))

    client = TestClient(app)
    resp = client.post("/market-data/load-default")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ready"] is True
    assert payload["blocking_errors"] == 0
    assert payload["counts"]["discount_curves"] > 5000
