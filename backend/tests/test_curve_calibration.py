import math

import pandas as pd
import pytest

from option_risk.data.calibration import calibrate_market_context_from_bundle
from option_risk.data.market_data import MarketDataBundle


def _bundle_with_calibration() -> MarketDataBundle:
    as_of = pd.Timestamp("2026-03-05")
    discount_curves = pd.DataFrame(
        [
            {
                "as_of_date": as_of,
                "curve_name": "RUB-DISCOUNT-RUB-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.80,
            }
        ]
    )
    forward_curves = pd.DataFrame(
        [
            {
                "as_of_date": as_of,
                "curve_name": "RUB-RUONIA-OIS-COMPOUND",
                "curve_type": "Форвардная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "forward_rate": 0.10,
            },
            {
                "as_of_date": as_of,
                "curve_name": "RUB-CBR-KEY-RATE",
                "curve_type": "Форвардная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "forward_rate": 0.10,
            },
        ]
    )
    fixings = pd.DataFrame(
        [
            {"index_name": "RUONIA Avg.", "fixing": 0.145, "as_of_date": as_of},
            {"index_name": "RUB KeyRate", "fixing": 0.170, "as_of_date": as_of},
        ]
    )
    calibration_instruments = pd.DataFrame(
        [
            {
                "instrument_name": "OIS Tom/6M. RUONIA Comp.",
                "product": "OIS",
                "tenor_label": "6M",
                "quote": 0.10,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
            {
                "instrument_name": "OIS Tom/1Y. RUONIA Comp.",
                "product": "OIS",
                "tenor_label": "1Y",
                "quote": 0.12,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
            {
                "instrument_name": "Fra. RUSFAR RUB 3m 3M/6M",
                "product": "FRA",
                "tenor_label": "3M",
                "quote": 0.165,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
            {
                "instrument_name": "IR Swap Tom/1Y. RUB KeyRate",
                "product": "IRS",
                "tenor_label": "1Y",
                "quote": 0.18,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
            {
                "instrument_name": "IR Swap Tom/2Y. RUB KeyRate",
                "product": "IRS",
                "tenor_label": "2Y",
                "quote": 0.19,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
        ]
    )
    return MarketDataBundle(
        fx_history=pd.DataFrame(columns=["currency_code", "obs_date", "rate", "nominal"]),
        calibration_instruments=calibration_instruments,
        discount_curves=discount_curves,
        forward_curves=forward_curves,
        fixings=fixings,
        validation_log=[],
    )


def _bundle_with_cross_currency_calibration() -> MarketDataBundle:
    as_of = pd.Timestamp("2026-03-05")
    fx_history = pd.DataFrame(
        [
            {"currency_code": "USD", "obs_date": as_of, "rate": 100.0, "nominal": 1.0},
            {"currency_code": "EUR", "obs_date": as_of, "rate": 120.0, "nominal": 1.0},
            {"currency_code": "CNY", "obs_date": as_of, "rate": 10.0, "nominal": 1.0},
        ]
    )
    discount_curves = pd.DataFrame(
        [
            {
                "as_of_date": as_of,
                "curve_name": "USD-DISCOUNT-USD-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.94,
            },
            {
                "as_of_date": as_of,
                "curve_name": "EUR-DISCOUNT-EUR-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.97,
            },
            {
                "as_of_date": as_of,
                "curve_name": "CNY-DISCOUNT-CNY-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.96,
            },
            {
                "as_of_date": as_of,
                "curve_name": "RUB-DISCOUNT-RUB-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.88,
            },
        ]
    )
    forward_curves = pd.DataFrame(columns=["as_of_date", "curve_name", "curve_type", "tenor_label", "tenor_years", "forward_rate"])
    fixings = pd.DataFrame(
        [
            {"index_name": "SOFR Comp.", "fixing": 0.04, "as_of_date": as_of},
        ]
    )
    calibration_instruments = pd.DataFrame(
        [
            {
                "instrument_name": "EUR/USD Fx Swap Spot/1Y",
                "product": "FX Swap",
                "tenor_label": "1Y",
                "quote": 0.0252631578947369,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
            {
                "instrument_name": "USD/CNY Fx Swap Spot/1Y",
                "product": "FX Swap",
                "tenor_label": "1Y",
                "quote": -0.1041666666666667,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
            {
                "instrument_name": "Basis Swap Spot/1Y. Libor USD 3m / Euribor EUR 3m",
                "product": "Basis",
                "tenor_label": "1Y",
                "quote": -0.0015,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
            {
                "instrument_name": "XCCY Tom/1Y. CNY / RUONIA Comp.",
                "product": "XCCY",
                "tenor_label": "1Y",
                "quote": 0.0070,
                "as_of_date": as_of,
                "source_file": "calibrationInstrument MAR 2026.xlsx",
            },
        ]
    )
    return MarketDataBundle(
        fx_history=fx_history,
        calibration_instruments=calibration_instruments,
        discount_curves=discount_curves,
        forward_curves=forward_curves,
        fixings=fixings,
        validation_log=[],
    )


def test_calibration_rebuilds_discount_curve_from_ois_quotes():
    result = calibrate_market_context_from_bundle(_bundle_with_calibration())
    curve = result.market_context.discount_curves["RUB-DISCOUNT-RUB-CSA"]

    expected_df_6m = 1.0 / (1.0 + 0.10 * 0.5)
    expected_df_1y = (1.0 - 0.12 * 0.5 * expected_df_6m) / (1.0 + 0.12 * 0.5)

    assert curve.discount_factor(0.5) == pytest.approx(expected_df_6m, rel=1e-9)
    assert curve.discount_factor(1.0) == pytest.approx(expected_df_1y, rel=1e-9)
    assert result.curve_sources["RUB-DISCOUNT-RUB-CSA"] == "calibrated_from_ois:RUB_RUONIA"


def test_calibration_rebuilds_projection_curve_from_irs_and_fixings():
    result = calibrate_market_context_from_bundle(_bundle_with_calibration())
    curve = result.market_context.forward_curves["RUB-CBR-KEY-RATE"]

    assert curve.rate(0.0) == pytest.approx(0.170, rel=1e-9)
    assert curve.rate(0.25) > 0.17
    assert curve.rate(1.0) == pytest.approx(0.1835300941, rel=1e-6)
    assert curve.rate(2.0) == pytest.approx(0.2228851929, rel=1e-6)
    assert result.curve_sources["RUB-CBR-KEY-RATE"] == "calibrated_from_irs_fra"
    assert any("rebuilt RUB-CBR-KEY-RATE" in msg.message for msg in result.validation_log)


def test_calibration_uses_fra_quotes_for_short_end_projection_curve():
    result = calibrate_market_context_from_bundle(_bundle_with_calibration())
    curve = result.market_context.forward_curves["RUB-RUSFAR-3M"]

    assert curve.rate(0.25) == pytest.approx(0.165, rel=1e-9)
    assert result.curve_sources["RUB-RUSFAR-3M"] == "calibrated_from_irs_fra"


def test_calibration_builds_fx_forward_curve_and_usd_oisfx_from_fx_swaps():
    result = calibrate_market_context_from_bundle(_bundle_with_cross_currency_calibration())

    eur_usd_curve = result.market_context.fx_forward_curves["EUR/USD"]
    usd_oisfx_curve = result.market_context.forward_curves["USD-OISFX"]

    assert eur_usd_curve.forward_price(0.0) == pytest.approx(1.2, rel=1e-9)
    assert eur_usd_curve.forward_price(1.0) == pytest.approx(1.225263157894737, rel=1e-9)
    assert usd_oisfx_curve.rate(0.0) == pytest.approx(0.04, rel=1e-9)
    assert usd_oisfx_curve.rate(1.0) == pytest.approx(1.0 / 0.95 - 1.0, rel=1e-9)
    assert result.curve_sources["EUR/USD"] == "calibrated_from_fx_swaps"
    assert result.curve_sources["USD-OISFX"] == "calibrated_from_fx_swaps"


def test_calibration_builds_basis_curves_from_basis_and_xccy_quotes():
    result = calibrate_market_context_from_bundle(_bundle_with_cross_currency_calibration())

    usd_eur_basis = result.market_context.basis_curves["USD/EUR:BASIS"]
    cny_rub_basis = result.market_context.basis_curves["CNY/RUB:BASIS"]

    assert usd_eur_basis.spread(1.0) == pytest.approx(-0.0015, rel=1e-9)
    assert cny_rub_basis.spread(1.0) == pytest.approx(0.0070, rel=1e-9)
    assert result.curve_sources["USD/EUR:BASIS"] == "calibrated_from_basis"
    assert result.curve_sources["CNY/RUB:BASIS"] == "calibrated_from_xccy"
