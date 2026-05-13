from __future__ import annotations

from typing import Callable

import pytest

pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import TRAVERSAL_INPUT_MESSAGE, app


def _minimal_metrics_payload(session_id: str) -> dict:
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
        "mode": "api",
        "market_data_session_id": session_id,
    }


TraversalRequest = Callable[[TestClient], object]


@pytest.mark.parametrize(
    "request_factory",
    [
        pytest.param(lambda client: client.get("/market-data/..%2Fsecret"), id="encoded-slash"),
        pytest.param(lambda client: client.get("/market-data/%2e%2e%2fsecret"), id="encoded-dots-slash"),
        pytest.param(lambda client: client.get("/market-data/%252e%252e%252fsecret"), id="double-encoded-slash"),
        pytest.param(lambda client: client.get("/market-data/..%5Csecret"), id="encoded-backslash"),
        pytest.param(lambda client: client.get("/market-data/%252e%252e%255csecret"), id="double-encoded-backslash"),
        pytest.param(lambda client: client.get("/market-data/%EF%BC%8E%EF%BC%8E%EF%BC%8Fsecret"), id="fullwidth-dots-slash"),
        pytest.param(lambda client: client.get("/market-data/valid?session_id=../secret"), id="query-plain"),
        pytest.param(lambda client: client.get("/market-data/valid?session_id=%252e%252e%252fsecret"), id="query-double-encoded"),
        pytest.param(
            lambda client: client.post("/metrics", json=_minimal_metrics_payload("%252e%252e%252fsecret")),
            id="json-session-id",
        ),
        pytest.param(
            lambda client: client.post(
                "/market-data/upload",
                data={"session_id": "．．／secret"},
                files={"file": ("curveDiscount.xlsx", b"test", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            ),
            id="multipart-fullwidth",
        ),
    ],
)
def test_traversal_like_session_inputs_return_unified_400(request_factory: TraversalRequest):
    client = TestClient(app)

    resp = request_factory(client)

    assert resp.status_code == 400
    assert resp.json()["message"] == TRAVERSAL_INPUT_MESSAGE


def test_valid_session_id_is_not_blocked_by_traversal_guard(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    client = TestClient(app)

    create_resp = client.post("/market-data/session")
    assert create_resp.status_code == 200

    session_id = create_resp.json()["session_id"]
    resp = client.get(f"/market-data/{session_id}")

    assert resp.status_code == 200
    assert resp.json()["session_id"] == session_id
