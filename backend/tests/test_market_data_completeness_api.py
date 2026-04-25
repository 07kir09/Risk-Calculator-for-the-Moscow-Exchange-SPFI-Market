from __future__ import annotations

import datetime as dt
import json

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app
from option_risk.data.market_data_completeness import assess_market_data_completeness
from option_risk.data.market_data_sessions import MarketDataSessionSummary
from option_risk.data.models import OptionPosition, Portfolio
from option_risk.pricing.market import DiscountCurve, ForwardCurve, MarketDataContext


SESSION_ID = "9" * 32


def _curve_market(*, complete: bool) -> MarketDataContext:
    today = dt.date(2026, 1, 1)
    discount_curves = {
        "RUB-DISCOUNT-RUB-CSA": DiscountCurve(
            name="RUB-DISCOUNT-RUB-CSA",
            as_of_date=today,
            tenor_years=np.array([1.0]),
            discount_factors=np.array([0.90]),
        )
    }
    forward_curves = {
        "RUB-RUONIA-OIS-COMPOUND": ForwardCurve(
            name="RUB-RUONIA-OIS-COMPOUND",
            as_of_date=today,
            tenor_years=np.array([0.0, 1.0]),
            forward_rates=np.array([0.12, 0.12]),
        )
    }
    if complete:
        discount_curves["USD-DISCOUNT-USD-CSA"] = DiscountCurve(
            name="USD-DISCOUNT-USD-CSA",
            as_of_date=today,
            tenor_years=np.array([1.0]),
            discount_factors=np.array([0.96]),
        )
        forward_curves["USD-SOFR"] = ForwardCurve(
            name="USD-SOFR",
            as_of_date=today,
            tenor_years=np.array([0.0, 1.0]),
            forward_rates=np.array([0.04, 0.04]),
        )
    return MarketDataContext(
        discount_curves=discount_curves,
        forward_curves=forward_curves,
        fx_spots={"USD": 90.0},
        base_currency="RUB",
    )


def _usd_swap(position_id: str = "usd_swap") -> dict:
    return {
        "instrument_type": "swap_ir",
        "position_id": position_id,
        "option_type": "call",
        "style": "european",
        "quantity": 1,
        "notional": 1_000_000,
        "underlying_symbol": "USD-SOFR",
        "underlying_price": 1,
        "strike": 0.05,
        "volatility": 0.0,
        "maturity_date": "2027-01-01",
        "valuation_date": "2026-01-01",
        "risk_free_rate": 0.03,
        "dividend_yield": 0.0,
        "currency": "USD",
        "liquidity_haircut": 0.0,
        "fixed_rate": 0.05,
        "float_rate": 0.04,
        "discount_curve_ref": "USD-DISCOUNT-USD-CSA",
        "projection_curve_ref": "USD-SOFR",
    }


def _payload(*, positions: list[dict] | None = None, mode: str = "api") -> dict:
    return {
        "positions": positions or [_usd_swap()],
        "scenarios": [
            {"scenario_id": "base", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
            {"scenario_id": "down", "underlying_shift": -0.01, "volatility_shift": 0.0, "rate_shift": 0.0},
        ],
        "base_currency": "RUB",
        "alpha": 0.99,
        "horizon_days": 1,
        "mode": mode,
        "calc_sensitivities": False,
        "calc_var_es": True,
        "calc_stress": True,
        "calc_margin_capital": True,
        "calc_correlations": False,
        "market_data_session_id": SESSION_ID,
    }


def _patch_market_session(monkeypatch, market: MarketDataContext):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    monkeypatch.setattr(
        "option_risk.api.load_market_data_bundle_for_session",
        lambda session_id: (object(), MarketDataSessionSummary(session_id=session_id, ready=True, validation_log=[], counts={})),
    )
    monkeypatch.setattr(
        "option_risk.api.build_bootstrapped_market_data",
        lambda bundle, base_currency="RUB": type(
            "Bootstrapped",
            (),
            {
                "market_context": market,
                "validation_log": [],
            },
        )(),
    )


def test_missing_discount_curves_fail_fast_or_partial_status(monkeypatch):
    _patch_market_session(monkeypatch, _curve_market(complete=False))
    monkeypatch.setattr("option_risk.api.run_calculation", lambda *args, **kwargs: pytest.fail("must fail before pricing"))

    response = TestClient(app).post("/metrics", json=_payload())

    assert response.status_code == 422
    body = response.json()
    assert body["message"] == "Недостаточно market-data для полного расчёта портфеля"
    assert body["calculation_status"] == "blocked"
    assert body["market_data_completeness"] == "incomplete"
    assert "USD discount" in body["missing_curves"]
    assert "USD forward" in body["missing_curves"]


def test_missing_curves_include_affected_positions(monkeypatch):
    _patch_market_session(monkeypatch, _curve_market(complete=False))

    response = TestClient(app).post("/metrics", json=_payload())

    assert response.status_code == 422
    body = response.json()
    assert body["affected_positions"] == ["usd_swap"]
    assert body["required_market_data"]["usd_swap"]


def test_complete_curves_allow_full_calculation(monkeypatch):
    _patch_market_session(monkeypatch, _curve_market(complete=True))

    response = TestClient(app).post("/metrics", json=_payload())

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["calculation_status"] == "complete"
    assert body["data_quality"]["market_data_completeness"] == "complete"
    assert body["data_quality"]["missing_curves"] == []


def test_no_zeroing_positions_without_warning():
    portfolio = Portfolio(positions=[OptionPosition(**_usd_swap())])

    result = assess_market_data_completeness(portfolio, _curve_market(complete=False))

    assert result.status == "incomplete"
    assert result.affected_positions == ["usd_swap"]
    assert "USD discount" in result.missing_curves


def test_base_value_is_net_pv_not_nominal_sum(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    position = {
        "instrument_type": "forward",
        "position_id": "mtm_forward",
        "option_type": "call",
        "style": "european",
        "quantity": 2,
        "notional": 1000,
        "underlying_symbol": "RUB",
        "underlying_price": 105,
        "strike": 100,
        "volatility": 0.0,
        "maturity_date": "2027-01-01",
        "valuation_date": "2026-01-01",
        "risk_free_rate": 0.0,
        "dividend_yield": 0.0,
        "currency": "RUB",
        "liquidity_haircut": 0.0,
    }

    payload = _payload(positions=[position])
    payload.pop("market_data_session_id", None)
    response = TestClient(app).post("/metrics", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["base_value"] == pytest.approx(10_000.0)
    assert body["base_value"] != position["notional"] * position["quantity"]
    assert body["valuation_label"] == "Net PV / MtM"


def test_var_es_scenario_method_labels(monkeypatch):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    position = {
        "instrument_type": "forward",
        "position_id": "rub_forward",
        "option_type": "call",
        "style": "european",
        "quantity": 1,
        "notional": 100,
        "underlying_symbol": "RUB",
        "underlying_price": 101,
        "strike": 100,
        "volatility": 0.0,
        "maturity_date": "2027-01-01",
        "valuation_date": "2026-01-01",
        "risk_free_rate": 0.0,
        "dividend_yield": 0.0,
        "currency": "RUB",
        "liquidity_haircut": 0.0,
    }
    payload = _payload(positions=[position])
    payload.pop("market_data_session_id", None)

    response = TestClient(app).post("/metrics", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["var_method"] == "scenario_quantile"
    assert body["valuation_label"] == "Net PV / MtM"


def test_large_portfolio_market_data_completeness(monkeypatch):
    _patch_market_session(monkeypatch, _curve_market(complete=False))
    df = pd.read_excel("Datasets/portfolio_large_1000.xlsx")
    positions = json.loads(df.where(df.notna(), None).to_json(orient="records"))

    response = TestClient(app).post("/metrics", json=_payload(positions=positions))

    assert response.status_code == 422
    body = response.json()
    assert body["market_data_completeness"] == "incomplete"
    assert body["affected_positions"]
    assert any("discount" in item for item in body["missing_curves"])
