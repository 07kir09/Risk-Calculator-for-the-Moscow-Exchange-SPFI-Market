import math
import pytest

# TestClient in starlette/fastapi requires httpx. If it's missing in local venv,
# this module is skipped instead of failing test collection.
pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app


def _position(
    position_id: str,
    *,
    underlying_price: float = 100.0,
    strike: float = 100.0,
    quantity: float = 1.0,
    currency: str = "RUB",
) -> dict:
    return {
        "instrument_type": "forward",
        "position_id": position_id,
        "option_type": "call",
        "style": "european",
        "quantity": quantity,
        "notional": 1,
        "underlying_symbol": "A",
        "underlying_price": underlying_price,
        "strike": strike,
        "volatility": 0.0,
        "maturity_date": "2026-12-31",
        "valuation_date": "2026-01-01",
        "risk_free_rate": 0.05,
        "dividend_yield": 0.0,
        "currency": currency,
        "liquidity_haircut": 0.0,
    }


def _payload(**overrides) -> dict:
    payload = {
        "positions": [
            _position("f1"),
            _position("f2", strike=95.0),
        ],
        "scenarios": [
            {"scenario_id": "s1", "underlying_shift": -0.01, "volatility_shift": 0.0, "rate_shift": 0.0},
            {"scenario_id": "s2", "underlying_shift": 0.01, "volatility_shift": 0.0, "rate_shift": 0.0},
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
    payload.update(overrides)
    return payload


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    return TestClient(app)


def test_metrics_endpoint_returns_200_when_correlations_are_degenerate(client):
    payload = _payload(
        positions=[
            _position("f1"),
            _position("f2"),
        ],
        scenarios=[
            {"scenario_id": "s1", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
            {"scenario_id": "s2", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
        ],
        calc_correlations=True,
    )

    resp = client.post("/metrics", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert "correlations" in data
    for row in data["correlations"]:
        for value in row:
            assert isinstance(value, (int, float))
            assert not math.isnan(value)


def test_metrics_endpoint_allows_disabling_correlations(client):
    resp = client.post("/metrics", json=_payload(calc_correlations=False))

    assert resp.status_code == 200
    assert resp.json()["correlations"] is None


def test_metrics_endpoint_does_not_calculate_correlations_by_default(client):
    resp = client.post("/metrics", json=_payload())

    assert resp.status_code == 200
    assert resp.json()["correlations"] is None


def test_metrics_endpoint_honors_query_include_correlations(client):
    resp = client.post("/metrics?include=correlations", json=_payload())

    assert resp.status_code == 200
    assert resp.json()["correlations"] is not None


def test_metrics_endpoint_body_include_has_priority_over_query_include(client):
    resp = client.post("/metrics?include=correlations", json=_payload(include=[]))

    assert resp.status_code == 200
    assert resp.json()["correlations"] is None


def test_metrics_endpoint_honors_body_include_correlations(client):
    resp = client.post("/metrics", json=_payload(include=["correlations"]))

    assert resp.status_code == 200
    assert resp.json()["correlations"] is not None


def test_fx_spot_scenario_shock_affects_base_currency_pnl(client):
    payload = _payload(
        positions=[_position("usd_forward", underlying_price=100.0, strike=90.0, currency="USD")],
        scenarios=[
            {
                "scenario_id": "base",
                "underlying_shift": 0.0,
                "volatility_shift": 0.0,
                "rate_shift": 0.0,
                "fx_spot_shifts": {"USD": 0.0},
            },
            {
                "scenario_id": "usd_down",
                "underlying_shift": 0.0,
                "volatility_shift": 0.0,
                "rate_shift": 0.0,
                "fx_spot_shifts": {"USD": -0.10},
            },
        ],
        fx_rates={"USD": 90.0},
        alpha=0.5,
        calc_sensitivities=False,
        calc_margin_capital=False,
        calc_correlations=False,
    )

    resp = client.post("/metrics", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data["pnl_distribution"][0] == pytest.approx(0.0)
    assert data["pnl_distribution"][1] < 0.0
    assert data["worst_stress"] == pytest.approx(data["pnl_distribution"][1])
    assert data["var_hist"] > 0.0


def test_metrics_endpoint_rejects_non_finite_results_instead_of_zeroing(client):
    payload = _payload(
        positions=[_position("overflow", underlying_price=1e308, strike=1.0, quantity=1e308)],
        scenarios=[
            {"scenario_id": "base", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
        ],
        calc_sensitivities=False,
        calc_var_es=False,
        calc_stress=False,
        calc_margin_capital=False,
        calc_correlations=False,
    )

    resp = client.post("/metrics", json=payload)

    assert resp.status_code == 400
    assert "нечисловое значение" in resp.json()["message"]


def test_metrics_endpoint_caps_correlations_and_logs_warning(client, monkeypatch):
    monkeypatch.setenv("OPTION_RISK_MAX_CORRELATION_POSITIONS", "2")
    payload = _payload(
        positions=[_position(f"f{i}", underlying_price=100.0 + (i % 3), strike=95.0) for i in range(3)],
        include=["correlations"],
    )

    resp = client.post("/metrics", json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data["correlations"] is None
    assert any(
        item["severity"] == "WARNING" and "корреляц" in item["message"].lower() and "пропущен" in item["message"].lower()
        for item in data["validation_log"]
    )


@pytest.mark.parametrize(
    "limits",
    [
        {},
        {"var_hist": -1},
        {"var_hist": "100"},
    ],
)
def test_metrics_endpoint_rejects_invalid_limits(client, limits):
    resp = client.post("/metrics", json=_payload(limits=limits))

    assert resp.status_code == 422
