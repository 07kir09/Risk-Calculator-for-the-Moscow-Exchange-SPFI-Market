import math
import pytest

# TestClient in starlette/fastapi requires httpx. If it's missing in local venv,
# this module is skipped instead of failing test collection.
pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app


def test_metrics_endpoint_returns_200_when_correlations_are_degenerate():
    client = TestClient(app)
    payload = {
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
            },
            {
                "instrument_type": "forward",
                "position_id": "f2",
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
            },
        ],
        "scenarios": [
            {"scenario_id": "s1", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
            {"scenario_id": "s2", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
        ],
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

    resp = client.post("/metrics", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "correlations" in data
    for row in data["correlations"]:
        for value in row:
            assert isinstance(value, (int, float))
            assert not math.isnan(value)


def test_metrics_endpoint_allows_disabling_correlations():
    client = TestClient(app)
    payload = {
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
            },
            {
                "instrument_type": "forward",
                "position_id": "f2",
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
            },
        ],
        "scenarios": [
            {"scenario_id": "s1", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
            {"scenario_id": "s2", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
        ],
        "alpha": 0.99,
        "horizon_days": 10,
        "base_currency": "RUB",
        "liquidity_model": "fraction_of_position_value",
        "mode": "api",
        "calc_sensitivities": True,
        "calc_var_es": True,
        "calc_stress": True,
        "calc_margin_capital": True,
        "calc_correlations": False,
    }

    resp = client.post("/metrics", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("correlations") is None
