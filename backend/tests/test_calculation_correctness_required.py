import json
import math
from pathlib import Path

import pandas as pd
import pytest

pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app
from option_risk.data.models import MarketScenario, OptionPosition, Portfolio
from option_risk.risk.pipeline import CalculationConfig, run_calculation


FX_RATES = {"USD": 90.0, "EUR": 100.0}
DATASETS_DIR = Path(__file__).resolve().parents[2] / "Datasets"


def _forward(position_id: str, currency: str, quantity: float, notional: float, spot: float, strike: float) -> dict:
    return {
        "instrument_type": "forward",
        "position_id": position_id,
        "option_type": "call",
        "style": "european",
        "quantity": quantity,
        "notional": notional,
        "underlying_symbol": position_id.upper(),
        "underlying_price": spot,
        "strike": strike,
        "volatility": 0.0,
        "maturity_date": "2027-01-01",
        "valuation_date": "2026-01-01",
        "risk_free_rate": 0.0,
        "dividend_yield": 0.0,
        "currency": currency,
        "liquidity_haircut": 0.0,
    }


def _positions() -> list[dict]:
    return [
        _forward("rub_long", "RUB", 2.0, 10.0, 100.0, 95.0),
        _forward("usd_long", "USD", 1.0, 5.0, 50.0, 48.0),
        _forward("eur_long", "EUR", 3.0, 2.0, 80.0, 75.0),
        _forward("usd_short", "USD", -1.0, 4.0, 70.0, 72.0),
    ]


def _scenarios() -> list[dict]:
    return [
        {"scenario_id": "base", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
        {"scenario_id": "shock_up", "underlying_shift": 0.10, "volatility_shift": 0.0, "rate_shift": 0.0},
        {"scenario_id": "shock_down", "underlying_shift": -0.05, "volatility_shift": 0.0, "rate_shift": 0.0},
        {"scenario_id": "stress_worst", "underlying_shift": -0.20, "volatility_shift": 0.0, "rate_shift": 0.0},
        {"scenario_id": "stress_mild", "underlying_shift": 0.02, "volatility_shift": 0.0, "rate_shift": 0.0},
    ]


def _payload(*, positions: list[dict] | None = None, scenarios: list[dict] | None = None, fx_rates: dict | None = FX_RATES) -> dict:
    payload = {
        "positions": positions or _positions(),
        "scenarios": scenarios or _scenarios(),
        "base_currency": "RUB",
        "fx_rates": fx_rates,
        "alpha": 0.80,
        "horizon_days": 1,
        "mode": "api",
        "calc_sensitivities": False,
        "calc_var_es": True,
        "calc_stress": True,
        "calc_margin_capital": True,
        "calc_correlations": False,
    }
    if fx_rates is None:
        payload.pop("fx_rates")
    return payload


def _fx(currency: str) -> float:
    return 1.0 if currency == "RUB" else FX_RATES[currency]


def _manual_value(position: dict, scenario: dict | None = None) -> float:
    shift = 0.0 if scenario is None else float(scenario["underlying_shift"])
    rate_shift = 0.0 if scenario is None else float(scenario["rate_shift"])
    tenor = (pd.Timestamp(position["maturity_date"]) - pd.Timestamp(position["valuation_date"])).days / 365.0
    discount = math.exp(-(float(position["risk_free_rate"]) + rate_shift) * tenor)
    spot = float(position["underlying_price"]) * (1.0 + shift)
    local = float(position["quantity"]) * float(position["notional"]) * (spot - float(position["strike"])) * discount
    return local * _fx(str(position["currency"]))


def _manual_pnl_matrix(positions: list[dict], scenarios: list[dict]) -> list[list[float]]:
    return [
        [_manual_value(position, scenario) - _manual_value(position) for scenario in scenarios]
        for position in positions
    ]


def _historical_var_es(pnls: list[float], alpha: float) -> tuple[float, float]:
    sorted_pnls = sorted(pnls)
    tail_count = max(1, math.ceil(len(sorted_pnls) * (1.0 - alpha) - 1e-12))
    tail = sorted_pnls[:tail_count]
    return max(0.0, -tail[-1]), max(0.0, -sum(tail) / len(tail))


def test_manual_small_portfolio_metrics_match_formula(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    positions = _positions()
    scenarios = _scenarios()
    response = TestClient(app).post("/metrics", json=_payload(positions=positions, scenarios=scenarios))
    assert response.status_code == 200, response.text
    data = response.json()

    pnl_matrix = _manual_pnl_matrix(positions, scenarios)
    pnl_distribution = [sum(row[index] for row in pnl_matrix) for index in range(len(scenarios))]
    expected_var, expected_es = _historical_var_es(pnl_distribution, 0.80)

    assert data["base_value"] == pytest.approx(sum(_manual_value(position) for position in positions), rel=1e-12, abs=1e-9)
    for actual_row, expected_row in zip(data["pnl_matrix"], pnl_matrix):
        assert actual_row == pytest.approx(expected_row, rel=1e-12, abs=1e-9)
    assert data["pnl_distribution"] == pytest.approx(pnl_distribution, rel=1e-12, abs=1e-9)
    assert data["var_hist"] == pytest.approx(expected_var, rel=1e-12, abs=1e-9)
    assert data["es_hist"] == pytest.approx(expected_es, rel=1e-12, abs=1e-9)
    assert data["variation_margin"] == pytest.approx(0.0, abs=1e-9)


def test_var_es_scenario_formula(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    response = TestClient(app).post("/metrics", json=_payload())
    assert response.status_code == 200, response.text
    data = response.json()

    expected_var, expected_es = _historical_var_es(data["pnl_distribution"], 0.80)

    assert data["var_hist"] == pytest.approx(expected_var, rel=1e-12, abs=1e-9)
    assert data["es_hist"] == pytest.approx(expected_es, rel=1e-12, abs=1e-9)


def test_top_contributors_sum_consistency(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    response = TestClient(app).post("/metrics", json=_payload())
    assert response.status_code == 200, response.text
    data = response.json()
    scenario_by_id = {scenario["scenario_id"]: index for index, scenario in enumerate(_scenarios())}

    for metric in ("var_hist", "stress"):
        rows = data["top_contributors"][metric]
        scenario_index = scenario_by_id[rows[0]["scenario_id"]]
        expected_total = data["pnl_distribution"][scenario_index]
        assert sum(row["pnl_contribution"] for row in rows) == pytest.approx(expected_total, rel=1e-12, abs=1e-9)

    es_rows = data["top_contributors"]["es_hist"]
    assert sum(row["pnl_contribution"] for row in es_rows) == pytest.approx(-data["es_hist"], rel=1e-12, abs=1e-9)


def test_missing_fx_no_silent_fallback(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    response = TestClient(app).post("/metrics", json=_payload(fx_rates=None))

    assert response.status_code == 400
    message = response.json()["message"]
    assert "USD/RUB" in message
    assert "EUR/RUB" in message
    assert "fallback 1.0" not in message


def test_api_request_cannot_enable_silent_fx_fallback(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    request = _payload(fx_rates=None)
    request["allow_fx_fallback"] = True

    response = TestClient(app).post("/metrics", json=request)

    assert response.status_code == 400
    assert "USD/RUB" in response.json()["message"]


@pytest.mark.parametrize("bad_rate", [0.0, -90.0])
def test_request_fx_rate_must_be_positive_finite(monkeypatch, bad_rate):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    request = _payload(fx_rates={"USD": bad_rate, "EUR": 100.0})

    response = TestClient(app).post("/metrics", json=request)

    assert response.status_code in {400, 422}
    assert "FX rate" in response.text or "finite" in response.text or "Input should be a finite number" in response.text


def test_large_portfolio_no_nan_inf(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    path = DATASETS_DIR / "portfolio_large_1000.xlsx"
    df = pd.read_excel(path)
    positions = json.loads(df.where(df.notna(), None).to_json(orient="records"))
    response = TestClient(app).post(
        "/metrics",
        json=_payload(positions=positions, scenarios=_scenarios(), fx_rates={"USD": 92.0}),
    )
    assert response.status_code == 200, response.text
    data = response.json()

    def walk(value):
        if isinstance(value, dict):
            for child in value.values():
                yield from walk(child)
        elif isinstance(value, list):
            for child in value:
                yield from walk(child)
        elif isinstance(value, (int, float)):
            yield float(value)

    assert all(math.isfinite(value) for value in walk(data))
    assert data["correlations"] is None


def test_run_calculation_allows_legacy_fx_fallback_only_when_explicitly_enabled():
    portfolio = Portfolio(positions=[OptionPosition(**row) for row in _positions()])
    scenarios = [MarketScenario(**row) for row in _scenarios()]
    cfg = CalculationConfig(
        base_currency="RUB",
        fx_rates={},
        alpha=0.80,
        calc_sensitivities=False,
        calc_correlations=False,
        allow_fx_fallback=True,
    )

    result = run_calculation(portfolio, scenarios, config=cfg)

    assert result.fx_warning is not None
    assert "fallback 1.0" in result.fx_warning
