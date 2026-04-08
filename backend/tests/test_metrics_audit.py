import json
from pathlib import Path

import numpy as np
import pytest

from option_risk.data.models import MarketScenario, OptionPosition, Portfolio
from option_risk.risk.pipeline import CalculationConfig, run_calculation
from option_risk.risk.portfolio import apply_scenario
from option_risk.risk.var_es import (
    LiquidityInput,
    historical_es,
    historical_var,
    liquidity_addon_breakdown,
    parametric_es,
    parametric_var,
)


GOLDEN_DIR = Path(__file__).resolve().parent / "golden"


def _load_golden_case(case_file: str):
    payload = json.loads((GOLDEN_DIR / case_file).read_text())
    portfolio = Portfolio(positions=[OptionPosition(**row) for row in payload["positions"]])
    scenarios = [MarketScenario(**row) for row in payload["scenarios"]]
    cfg = CalculationConfig(
        alpha=float(payload["config"]["alpha"]),
        horizon_days=int(payload["config"]["horizon_days"]),
        base_currency=str(payload["config"]["base_currency"]),
        fx_rates=payload["config"].get("fx_rates"),
        liquidity_model=str(payload["config"]["liquidity_model"]),
        mode=str(payload["config"]["mode"]),
        calc_sensitivities=True,
        calc_var_es=True,
        calc_stress=True,
        calc_margin_capital=True,
    )
    return portfolio, scenarios, cfg, payload["expected"]


@pytest.mark.parametrize(
    "case_file",
    [
        "golden_case_single_forward.json",
        "golden_case_two_currency_fx.json",
        "golden_case_parametric_horizon.json",
    ],
)
def test_golden_cases(case_file: str):
    portfolio, scenarios, cfg, expected = _load_golden_case(case_file)
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)
    for metric, expected_value in expected.items():
        actual = getattr(result, metric)
        assert actual is not None
        assert actual == pytest.approx(expected_value, rel=1e-9, abs=1e-9)


def test_quantile_convention_excel_like_discrete_without_interpolation():
    pnls = [-float(i) for i in range(1, 101)]  # 100 наблюдений: -1, -2, ..., -100
    var95 = historical_var(pnls, alpha=0.95)
    var99 = historical_var(pnls, alpha=0.99)

    # Excel-like дискретная конвенция: k=ceil(N*(1-CL))
    # CL=95% => k=ceil(100*0.05)=5 => -96 => VaR=96
    # CL=99% => k=ceil(100*0.01)=1 => -100 => VaR=100
    assert var95 == pytest.approx(96.0)
    assert var99 == pytest.approx(100.0)

    # Дополнительная защита от неожиданной интерполяции.
    losses = -np.asarray(pnls, dtype=np.float64)
    interpolated_q95 = float(np.quantile(losses, 0.95, method="linear"))
    assert var95 != pytest.approx(interpolated_q95)


def test_historical_es_uses_left_tail_and_includes_var_point():
    pnls = [-10.0, -5.0, 0.0, 5.0, 10.0]
    var60 = historical_var(pnls, alpha=0.60)
    es60 = historical_es(pnls, alpha=0.60)
    assert var60 == pytest.approx(5.0)
    assert es60 == pytest.approx(7.5)


def test_weighted_historical_var_es_by_scenario_probabilities():
    pnls = [-100.0, -10.0, 5.0]
    probs = [0.01, 0.94, 0.05]
    var95 = historical_var(pnls, alpha=0.95, scenario_weights=probs)
    es95 = historical_es(pnls, alpha=0.95, scenario_weights=probs)
    assert var95 == pytest.approx(10.0)
    assert es95 == pytest.approx(28.0)
    # Без весов будет другая дискретная точка хвоста.
    assert historical_var(pnls, alpha=0.95) == pytest.approx(100.0)


def test_weighted_historical_var_rejects_invalid_weights():
    pnls = [-10.0, 0.0, 10.0]
    with pytest.raises(ValueError):
        historical_var(pnls, alpha=0.95, scenario_weights=[1.0, 2.0])  # length mismatch
    with pytest.raises(ValueError):
        historical_var(pnls, alpha=0.95, scenario_weights=[1.0, -1.0, 1.0])  # negative weight


def test_parametric_var_es_scale_with_horizon():
    pnls = [-10.0, 0.0, 10.0]  # mu=0, sample sigma=10
    var95_t4 = parametric_var(pnls, alpha=0.95, horizon_days=4)
    es95_t4 = parametric_es(pnls, alpha=0.95, horizon_days=4)
    assert var95_t4 == pytest.approx(32.89707253902944, rel=1e-9)
    assert es95_t4 == pytest.approx(41.25425615014856, rel=1e-9)


def test_cornish_fisher_tail_is_not_weaker_than_normal():
    pnls = [-200.0, -20.0, -10.0, -5.0, 0.0, 10.0, 15.0, 20.0, 25.0, 30.0]
    var_n = parametric_var(pnls, alpha=0.99, horizon_days=1, tail_model="normal")
    es_n = parametric_es(pnls, alpha=0.99, horizon_days=1, tail_model="normal")
    var_cf = parametric_var(pnls, alpha=0.99, horizon_days=1, tail_model="cornish_fisher")
    es_cf = parametric_es(pnls, alpha=0.99, horizon_days=1, tail_model="cornish_fisher")
    assert var_cf >= var_n
    assert es_cf >= es_n
    assert es_cf >= var_cf


def test_lc_var_addon_dimension_is_money():
    total, rows = liquidity_addon_breakdown(
        [LiquidityInput(position_id="p1", quantity=10, position_value=1000.0, haircut=0.1)],
        model="fraction_of_position_value",
    )
    assert total == pytest.approx(100.0)
    assert rows[0].add_on_money == pytest.approx(100.0)


def test_stress_volatility_is_clamped_and_rate_shift_is_absolute():
    position = OptionPosition(
        instrument_type="option",
        position_id="opt_1",
        option_type="call",
        style="european",
        quantity=1,
        notional=1.0,
        underlying_symbol="TEST",
        underlying_price=100.0,
        strike=100.0,
        volatility=0.2,
        maturity_date="2026-01-01",
        valuation_date="2025-01-01",
        risk_free_rate=0.05,
        currency="RUB",
        liquidity_haircut=0.0,
    )
    scenario = MarketScenario(
        scenario_id="hard_vol_down",
        underlying_shift=0.0,
        volatility_shift=-2.0,
        rate_shift=0.01,
    )
    bumped = apply_scenario(position, scenario)
    assert bumped.volatility > 0.0
    assert bumped.volatility == pytest.approx(1e-8)
    assert bumped.risk_free_rate == pytest.approx(0.06)


def test_multi_currency_without_fx_logs_warning():
    portfolio, scenarios, cfg, _ = _load_golden_case("golden_case_two_currency_fx.json")
    cfg.fx_rates = {}  # намеренно убираем FX
    result = run_calculation(portfolio, scenarios, limits_cfg=None, config=cfg)
    assert result.var_hist == pytest.approx(15.0)  # fallback 1.0 + 1.0 для валют
    assert any("FX" in msg.message for msg in result.validation_log)
