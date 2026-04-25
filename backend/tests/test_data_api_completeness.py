from pathlib import Path

import pandas as pd
import pytest

pytest.importorskip("httpx", reason="fastapi TestClient requires httpx")
from fastapi.testclient import TestClient

from option_risk.api import app
from option_risk.data.market_data import load_market_data_bundle_from_directory
from option_risk.data.market_data_sessions import create_market_data_session, get_market_data_session_dir, summarize_market_data_session
from option_risk.pricing.market import build_market_data_context_from_bundle


def _write_xlsx(path: Path, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_excel(path, index=False)


def _write_required_market_files(base_dir: Path) -> None:
    _write_xlsx(
        base_dir / "curveDiscount.xlsx",
        [
            {
                "Дата": "2026-04-25",
                "Кривая": "RUB-DISCOUNT-RUB-CSA",
                "Тип": "Дисконтная",
                "Дисконт фактор": "1W",
                "Тенор": 0.0192,
                "Ставка": 0.9965,
            }
        ],
    )
    _write_xlsx(
        base_dir / "curveForward.xlsx",
        [
            {
                "Дата": "2026-04-25",
                "Кривая": "RUB-RUSFAR-OIS-COMPOUND",
                "Тип": "Форвардная",
                "Срок": "1W",
                "Тенор": 0.0192,
                "Ставка": 0.13,
            }
        ],
    )
    _write_xlsx(base_dir / "fixing.xlsx", [{"Индекс": "RUONIA Avg.", "Фиксинг": 0.13, "Дата": "2026-04-25"}])


def _write_fx_table(base_dir: Path, filename: str, pairs: dict[str, float]) -> None:
    _write_xlsx(
        base_dir / filename,
        [
            {"pair": pair, "date": "2026-04-25", "rate": rate, "nominal": 1}
            for pair, rate in pairs.items()
        ],
    )


def _position(position_id: str, currency: str) -> dict:
    return {
        "instrument_type": "forward",
        "position_id": position_id,
        "option_type": "call",
        "style": "european",
        "quantity": 1,
        "notional": 1,
        "underlying_symbol": position_id.upper(),
        "underlying_price": 100.0,
        "strike": 90.0,
        "volatility": 0.0,
        "maturity_date": "2026-12-31",
        "valuation_date": "2026-04-25",
        "risk_free_rate": 0.05,
        "dividend_yield": 0.0,
        "currency": currency,
        "liquidity_haircut": 0.0,
    }


def _metrics_payload(session_id: str | None, currencies: list[str]) -> dict:
    payload = {
        "positions": [_position(f"p_{currency.lower()}_{idx}", currency) for idx, currency in enumerate(currencies)],
        "scenarios": [],
        "base_currency": "RUB",
        "mode": "api",
        "calc_sensitivities": False,
        "calc_var_es": False,
        "calc_stress": False,
        "calc_margin_capital": False,
        "calc_correlations": False,
    }
    if session_id:
        payload["market_data_session_id"] = session_id
    return payload


def _ready_session(monkeypatch, tmp_path: Path, fx_pairs: dict[str, float], *, fx_filename: str = "market_data_fx_full.xlsx") -> str:
    monkeypatch.setenv("OPTION_RISK_MARKET_SESSION_ROOT", str(tmp_path / "sessions"))
    session_id = create_market_data_session()
    session_dir = get_market_data_session_dir(session_id)
    _write_required_market_files(session_dir)
    if fx_pairs:
        _write_fx_table(session_dir, fx_filename, fx_pairs)
    return session_id


def _numeric_payload(session_id: str) -> dict:
    payload = _metrics_payload(session_id, ["USD", "EUR"])
    payload.update(
        {
            "scenarios": [
                {"scenario_id": "down", "underlying_shift": -0.1, "volatility_shift": 0.0, "rate_shift": 0.0},
                {"scenario_id": "base", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
                {"scenario_id": "up", "underlying_shift": 0.1, "volatility_shift": 0.0, "rate_shift": 0.0},
            ],
            "calc_var_es": True,
            "calc_stress": True,
            "calc_margin_capital": True,
            "alpha": 0.95,
            "horizon_days": 10,
        }
    )
    return payload


def _metrics_response(monkeypatch, tmp_path: Path, fx_pairs: dict[str, float], *, fx_filename: str = "market_data_fx_full.xlsx") -> dict:
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    session_id = _ready_session(monkeypatch, tmp_path, fx_pairs, fx_filename=fx_filename)
    client = TestClient(app)
    resp = client.post("/metrics", json=_numeric_payload(session_id))
    assert resp.status_code == 200, resp.text
    return resp.json()


def _assert_metric_equivalence(left: dict, right: dict, *, rel: float = 1e-12) -> None:
    for key in ["base_value", "var_hist", "es_hist", "lc_var", "initial_margin", "variation_margin"]:
        assert left[key] == pytest.approx(right[key], rel=rel, abs=1e-9), key

    left_top = left["top_contributors"]
    right_top = right["top_contributors"]
    assert left_top.keys() == right_top.keys()
    for metric, left_rows in left_top.items():
        right_rows = right_top[metric]
        assert len(left_rows) == len(right_rows)
        for left_row, right_row in zip(left_rows, right_rows):
            assert left_row["position_id"] == right_row["position_id"]
            assert left_row["pnl_contribution"] == pytest.approx(right_row["pnl_contribution"], rel=rel, abs=1e-9)
            assert left_row["abs_pnl_contribution"] == pytest.approx(right_row["abs_pnl_contribution"], rel=rel, abs=1e-9)


def test_rub_only_portfolio_does_not_require_fx(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    session_id = _ready_session(monkeypatch, tmp_path, {})
    client = TestClient(app)

    resp = client.post("/metrics", json=_metrics_payload(session_id, ["RUB"]))

    assert resp.status_code == 200


def test_usd_portfolio_requires_usd_rub_when_fx_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    session_id = _ready_session(monkeypatch, tmp_path, {})
    client = TestClient(app)

    resp = client.post("/metrics", json=_metrics_payload(session_id, ["USD"]))

    assert resp.status_code == 400
    assert "USD/RUB" in resp.json()["message"]


def test_usd_portfolio_uses_market_data_usd_rub(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    session_id = _ready_session(monkeypatch, tmp_path, {"USD/RUB": 92.5})
    client = TestClient(app)

    resp = client.post("/metrics", json=_metrics_payload(session_id, ["USD"]))

    assert resp.status_code == 200
    assert resp.json()["fx_warning"] is None


def test_eur_usd_portfolio_reports_complete_missing_pair_list(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    session_id = _ready_session(monkeypatch, tmp_path, {"USD/RUB": 92.5})
    client = TestClient(app)

    resp = client.post("/metrics", json=_metrics_payload(session_id, ["EUR", "USD"]))

    assert resp.status_code == 400
    message = resp.json()["message"]
    assert "EUR/RUB" in message
    assert "USD/RUB" not in message


def test_fx_missing_pairs_are_complete(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    session_id = _ready_session(monkeypatch, tmp_path, {})
    client = TestClient(app)

    resp = client.post("/metrics", json=_metrics_payload(session_id, ["EUR", "USD"]))

    assert resp.status_code == 400
    message = resp.json()["message"]
    assert "EUR/RUB" in message
    assert "USD/RUB" in message


def test_eur_usd_portfolio_uses_full_market_data_fx(monkeypatch, tmp_path):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    session_id = _ready_session(monkeypatch, tmp_path, {"EUR/RUB": 100.1, "USD/RUB": 92.5})
    client = TestClient(app)

    resp = client.post("/metrics", json=_metrics_payload(session_id, ["EUR", "USD"]))

    assert resp.status_code == 200
    summary = summarize_market_data_session(session_id)
    assert summary.available_fx_pairs == ["EUR/RUB", "USD/RUB"]


def test_fx_aliases_are_parsed_to_canonical_pairs(tmp_path):
    _write_required_market_files(tmp_path)
    _write_fx_table(
        tmp_path,
        "market_data_fx_aliases.xlsx",
        {
            "USDRUB": 92.5,
            "EUR-RUB": 100.1,
            "GBP_RUB": 110.2,
        },
    )

    bundle = load_market_data_bundle_from_directory(tmp_path)
    context = build_market_data_context_from_bundle(bundle, base_currency="RUB")

    assert context.fx_rate("USD", "RUB") == pytest.approx(92.5)
    assert context.fx_rate("EUR", "RUB") == pytest.approx(100.1)
    assert context.fx_rate("GBP", "RUB") == pytest.approx(110.2)


def test_inverse_fx_pairs_are_supported_explicitly(tmp_path):
    _write_required_market_files(tmp_path)
    _write_fx_table(tmp_path, "market_data_fx_inverse_pairs.xlsx", {"RUB/USD": 1 / 92.5})

    bundle = load_market_data_bundle_from_directory(tmp_path)
    context = build_market_data_context_from_bundle(bundle, base_currency="RUB")

    assert context.fx_rate("USD", "RUB") == pytest.approx(92.5)


def test_fx_alias_numeric_equivalence(monkeypatch, tmp_path):
    direct = _metrics_response(monkeypatch, tmp_path / "direct", {"USD/RUB": 90.0, "EUR/RUB": 100.0})
    alias = _metrics_response(
        monkeypatch,
        tmp_path / "alias",
        {"USDRUB": 90.0, "EUR-RUB": 100.0},
        fx_filename="market_data_fx_aliases.xlsx",
    )

    _assert_metric_equivalence(direct, alias)


def test_fx_inverse_numeric_equivalence(monkeypatch, tmp_path):
    direct = _metrics_response(monkeypatch, tmp_path / "direct", {"USD/RUB": 90.0, "EUR/RUB": 100.0})
    inverse = _metrics_response(
        monkeypatch,
        tmp_path / "inverse",
        {"RUB/USD": 1 / 90.0, "RUB/EUR": 1 / 100.0},
        fx_filename="market_data_fx_inverse_pairs.xlsx",
    )

    _assert_metric_equivalence(direct, inverse)


def test_wrong_inverse_fx_changes_metrics_explicitly(monkeypatch, tmp_path):
    direct = _metrics_response(monkeypatch, tmp_path / "direct", {"USD/RUB": 90.0, "EUR/RUB": 100.0})
    wrong_inverse = _metrics_response(
        monkeypatch,
        tmp_path / "wrong_inverse",
        {"RUB/USD": 0.5, "RUB/EUR": 0.5},
        fx_filename="market_data_fx_inverse_pairs.xlsx",
    )

    assert wrong_inverse["base_value"] != pytest.approx(direct["base_value"], rel=1e-6, abs=1e-6)
    assert abs(wrong_inverse["base_value"] - direct["base_value"]) > 100.0


@pytest.mark.parametrize("bad_rate", [0.0, -90.0])
def test_market_data_fx_rate_must_be_positive(monkeypatch, tmp_path, bad_rate):
    monkeypatch.setenv("OPTION_RISK_USE_LATEST_MARKET_DATA", "0")
    session_id = _ready_session(monkeypatch, tmp_path, {"USD/RUB": bad_rate, "EUR/RUB": 100.0})
    client = TestClient(app)

    resp = client.post("/metrics", json=_numeric_payload(session_id))

    assert resp.status_code == 400
    assert "FX spot" in resp.json()["message"]
