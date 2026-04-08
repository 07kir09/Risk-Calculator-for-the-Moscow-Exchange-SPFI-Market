import datetime as dt
from pathlib import Path

import pandas as pd

from option_risk.data.bootstrap import build_bootstrapped_market_data
from option_risk.data.loading import load_portfolio_from_csv
from option_risk.data.market_data import MarketDataBundle


def _market_data_bundle() -> MarketDataBundle:
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
                "curve_name": "RUB-DISCOUNT-RUB-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "discount_factor": 0.94,
            },
            {
                "as_of_date": as_of,
                "curve_name": "RUB-DISCOUNT-RUB-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.88,
            },
            {
                "as_of_date": as_of,
                "curve_name": "EUR-DISCOUNT-EUR-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "discount_factor": 0.985,
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
                "curve_name": "EUR-DISCOUNT-RUB-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "discount_factor": 0.98,
            },
            {
                "as_of_date": as_of,
                "curve_name": "EUR-DISCOUNT-RUB-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.965,
            },
            {
                "as_of_date": as_of,
                "curve_name": "EUR-DISCOUNT-USD-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "discount_factor": 0.982,
            },
            {
                "as_of_date": as_of,
                "curve_name": "EUR-DISCOUNT-USD-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.968,
            },
            {
                "as_of_date": as_of,
                "curve_name": "CNY-DISCOUNT-CNY-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "discount_factor": 0.975,
            },
            {
                "as_of_date": as_of,
                "curve_name": "CNY-DISCOUNT-CNY-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.95,
            },
            {
                "as_of_date": as_of,
                "curve_name": "CNY-DISCOUNT-RUB-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "discount_factor": 0.972,
            },
            {
                "as_of_date": as_of,
                "curve_name": "CNY-DISCOUNT-RUB-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.948,
            },
            {
                "as_of_date": as_of,
                "curve_name": "USD-DISCOUNT-USD-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "discount_factor": 0.98,
            },
            {
                "as_of_date": as_of,
                "curve_name": "USD-DISCOUNT-USD-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.95,
            },
            {
                "as_of_date": as_of,
                "curve_name": "RUB-DISCOUNT-USD-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "discount_factor": 0.945,
            },
            {
                "as_of_date": as_of,
                "curve_name": "RUB-DISCOUNT-USD-CSA",
                "curve_type": "Дисконтная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "discount_factor": 0.89,
            },
        ]
    )
    forward_curves = pd.DataFrame(
        [
            {
                "as_of_date": as_of,
                "curve_name": "RUB-CBR-KEY-RATE",
                "curve_type": "Форвардная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "forward_rate": 0.175,
            },
            {
                "as_of_date": as_of,
                "curve_name": "RUB-CBR-KEY-RATE",
                "curve_type": "Форвардная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "forward_rate": 0.17,
            },
            {
                "as_of_date": as_of,
                "curve_name": "RUB-RUONIA-OIS-COMPOUND",
                "curve_type": "Форвардная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "forward_rate": 0.16,
            },
            {
                "as_of_date": as_of,
                "curve_name": "RUB-RUONIA-OIS-COMPOUND",
                "curve_type": "Форвардная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "forward_rate": 0.158,
            },
            {
                "as_of_date": as_of,
                "curve_name": "CNY-RUSFARCNY-OIS-COMPOUND",
                "curve_type": "Форвардная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "forward_rate": 0.03,
            },
            {
                "as_of_date": as_of,
                "curve_name": "CNY-RUSFARCNY-OIS-COMPOUND",
                "curve_type": "Форвардная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "forward_rate": 0.031,
            },
            {
                "as_of_date": as_of,
                "curve_name": "EUR-EURIBOR-Act/365-3M",
                "curve_type": "Форвардная",
                "tenor_label": "6M",
                "tenor_years": 0.5,
                "forward_rate": 0.022,
            },
            {
                "as_of_date": as_of,
                "curve_name": "EUR-EURIBOR-Act/365-3M",
                "curve_type": "Форвардная",
                "tenor_label": "1Y",
                "tenor_years": 1.0,
                "forward_rate": 0.023,
            },
        ]
    )
    fixings = pd.DataFrame(
        [
            {"index_name": "RUB KeyRate", "fixing": 0.18, "as_of_date": pd.Timestamp("2026-03-04")},
            {"index_name": "RUONIA Avg.", "fixing": 0.149, "as_of_date": pd.Timestamp("2026-03-05")},
            {"index_name": "RUSFARCNY Comp.", "fixing": 0.028, "as_of_date": pd.Timestamp("2026-03-05")},
            {"index_name": "SOFR Comp.", "fixing": 0.04, "as_of_date": pd.Timestamp("2026-03-05")},
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
            }
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


def test_build_bootstrapped_market_data_injects_latest_fixings_into_zero_tenor():
    bootstrapped = build_bootstrapped_market_data(_market_data_bundle())

    ruonia_curve = bootstrapped.market_context.forward_curves["RUB-RUONIA-OIS-COMPOUND"]
    keyrate_curve = bootstrapped.market_context.forward_curves["RUB-CBR-KEY-RATE"]

    assert ruonia_curve.tenor_years[0] == 0.0
    assert ruonia_curve.forward_rates[0] == 0.149
    assert keyrate_curve.tenor_years[0] == 0.0
    assert keyrate_curve.forward_rates[0] == 0.18


def test_bootstrapped_market_data_exposes_fixing_history_for_projection_curve_aliases():
    bootstrapped = build_bootstrapped_market_data(_market_data_bundle())

    sofr_series = bootstrapped.market_context.get_fixing_series(projection_curve_ref="USD-OISFX")

    assert sofr_series is not None
    assert sofr_series.rate_on_or_before(dt.date(2026, 3, 5)) == 0.04


def test_trade_export_import_auto_assigns_curve_refs_and_leg_settings(tmp_path: Path):
    csv_text = (
        "Номер в клиринговой системе,Номер в торговой системе,Дата регистрации,Продукт,Инструмент,Направление,"
        "Цена,Стоимость,Курс,Начало,Окончание,Сумма 1,Валюта 1,Сумма 2,Валюта 2,Страйк\n"
        "6150,6150,05.03.2026,FX Fwd,FX Fwd EUR/RUB 2W,Sell,91.921,594884.96,,19.03.2026,19.03.2026,1000000,EUR,91921000,RUB,\n"
        "4457,4457,13.02.2026,IRS,IRS TOD/2Y RUB KeyRate,Pay Fixed,0.17,-14791.7,,13.02.2026,12.02.2028,1000000,RUB,1000000,RUB,\n"
        "9001,9001,05.03.2026,XCCY,XCCY Tom/1Y CNY / RUONIA Comp.,Buy,0.03,0,,06.03.2026,06.03.2027,7000000,CNY,90000000,RUB,\n"
        "7001,7001,05.03.2026,Basis,Basis Swap Spot/1Y. Libor USD 3m / Euribor EUR 3m,Buy,-0.0015,0,,05.03.2026,05.03.2027,1000000,USD,1200000,EUR,\n"
    )
    path = tmp_path / "trade.csv"
    path.write_text(csv_text, encoding="utf-8")

    bootstrapped = build_bootstrapped_market_data(_market_data_bundle())
    portfolio, log = load_portfolio_from_csv(path, market_bootstrap=bootstrapped)

    assert len(portfolio.positions) == 4
    assert not [msg for msg in log if msg.severity == "ERROR"]

    fwd = portfolio.positions[0]
    assert fwd.start_date == dt.date(2026, 3, 19)
    assert fwd.settlement_date == dt.date(2026, 3, 19)
    assert fwd.receive_currency == "EUR"
    assert fwd.pay_currency == "RUB"
    assert fwd.collateral_currency == "RUB"
    assert fwd.receive_leg_notional == 1_000_000.0
    assert fwd.pay_leg_notional == 91_921_000.0
    assert fwd.receive_discount_curve_ref == "EUR-DISCOUNT-RUB-CSA"
    assert fwd.pay_discount_curve_ref == "RUB-DISCOUNT-RUB-CSA"
    assert fwd.pay_calendar == "RUB+TARGET"
    assert fwd.pay_business_day_convention == "modified_following"

    irs = portfolio.positions[1]
    assert irs.start_date == dt.date(2026, 2, 13)
    assert irs.settlement_date == dt.date(2028, 2, 12)
    assert irs.collateral_currency == "RUB"
    assert irs.discount_curve_ref == "RUB-DISCOUNT-RUB-CSA"
    assert irs.projection_curve_ref == "RUB-CBR-KEY-RATE"
    assert irs.fixing_index_ref == "RUB KeyRate"
    assert irs.day_count_convention == "ACT/365"
    assert irs.business_day_convention == "modified_following"
    assert irs.reset_convention == "in_advance"
    assert irs.float_leg_frequency_months == 3
    assert irs.fixed_leg_frequency_months == 6
    assert irs.fixing_days_lag == 0

    xccy = portfolio.positions[2]
    assert xccy.pay_currency == "CNY"
    assert xccy.receive_currency == "RUB"
    assert xccy.collateral_currency == "RUB"
    assert xccy.pay_leg_notional == 7_000_000.0
    assert xccy.receive_leg_notional == 90_000_000.0
    assert xccy.pay_discount_curve_ref == "CNY-DISCOUNT-RUB-CSA"
    assert xccy.receive_discount_curve_ref == "RUB-DISCOUNT-RUB-CSA"
    assert xccy.pay_projection_curve_ref == "CNY-RUSFARCNY-OIS-COMPOUND"
    assert xccy.receive_projection_curve_ref == "RUB-RUONIA-OIS-COMPOUND"
    assert xccy.pay_calendar == "CNY+RUB"
    assert xccy.receive_calendar == "CNY+RUB"
    assert xccy.pay_fixing_calendar == "CNY"
    assert xccy.receive_fixing_calendar == "RUB"
    assert xccy.pay_reset_convention == "in_arrears"
    assert xccy.receive_reset_convention == "in_arrears"
    assert xccy.pay_fixing_days_lag == 0
    assert xccy.receive_fixing_days_lag == 0
    assert xccy.exchange_principal is True

    basis = portfolio.positions[3]
    assert basis.pay_currency == "USD"
    assert basis.receive_currency == "EUR"
    assert basis.collateral_currency == "USD"
    assert basis.pay_discount_curve_ref == "USD-DISCOUNT-USD-CSA"
    assert basis.receive_discount_curve_ref == "EUR-DISCOUNT-USD-CSA"
    assert basis.pay_projection_curve_ref == "USD-OISFX"
    assert basis.receive_projection_curve_ref == "EUR-EURIBOR-Act/365-3M"
    assert basis.pay_calendar == "TARGET+USD"
    assert basis.receive_calendar == "TARGET+USD"
    assert basis.pay_fixing_calendar == "USD"
    assert basis.receive_fixing_calendar == "TARGET"
    assert basis.pay_spread == -0.0015
    assert basis.fixed_rate is None
    assert basis.pay_fixed_rate is None
    assert basis.receive_fixed_rate is None
    assert basis.pay_reset_convention == "in_advance"
    assert basis.receive_reset_convention == "in_advance"
    assert basis.pay_fixing_days_lag == 2
    assert basis.receive_fixing_days_lag == 2
    assert basis.float_leg_frequency_months == 3
    assert basis.fixed_leg_frequency_months == 3
