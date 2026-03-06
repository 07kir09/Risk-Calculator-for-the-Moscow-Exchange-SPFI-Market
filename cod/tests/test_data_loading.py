from pathlib import Path

from option_risk.data.loading import load_portfolio_from_csv


def test_load_portfolio_csv_accepts_empty_optional_columns(tmp_path: Path):
    csv_text = (
        "instrument_type,position_id,option_type,style,quantity,notional,underlying_symbol,"
        "underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,"
        "dividend_yield,currency,liquidity_haircut,model,fixed_rate,float_rate,day_count\n"
        "forward,fwd_1,call,european,2,100000,USDRUB,90,90,0,2025-07-01,2025-01-01,0.05,,RUB,0,,,,\n"
    )
    path = tmp_path / "portfolio.csv"
    path.write_text(csv_text, encoding="utf-8")

    portfolio, log = load_portfolio_from_csv(path)

    assert len(portfolio.positions) == 1
    assert log == []
    p = portfolio.positions[0]
    assert p.model is None
    assert p.fixed_rate is None
    assert p.float_rate is None
    assert p.day_count is None
    assert p.dividend_yield == 0.0
    assert p.liquidity_haircut == 0.0


def test_load_portfolio_csv_applies_defaults_for_missing_currency_and_option_fields(tmp_path: Path):
    csv_text = (
        "instrument_type,position_id,option_type,style,quantity,notional,underlying_symbol,"
        "underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,"
        "dividend_yield,currency,liquidity_haircut,model,fixed_rate,float_rate,day_count\n"
        "forward,fwd_2,,,1,100000,USDRUB,90,90,0,2025-07-01,2025-01-01,0.05,,,,,,,\n"
    )
    path = tmp_path / "portfolio.csv"
    path.write_text(csv_text, encoding="utf-8")

    portfolio, log = load_portfolio_from_csv(path)

    assert len(portfolio.positions) == 1
    assert log == []
    p = portfolio.positions[0]
    assert p.option_type.value == "call"
    assert p.style.value == "european"
    assert p.currency == "RUB"


def test_load_portfolio_csv_supports_trade_export_format(tmp_path: Path):
    csv_text = (
        "Номер в клиринговой системе,Номер в торговой системе,Дата регистрации,Продукт,Инструмент,Направление,"
        "Цена,Стоимость,Курс,Начало,Окончание,Сумма 1,Валюта 1,Сумма 2,Валюта 2,Страйк\n"
        "6150,6150,05.03.2026,FX Fwd,FX Fwd EUR/RUB 2W,Sell,91.921,594884.96,,19.03.2026,19.03.2026,1000000,EUR,91921000,RUB,\n"
        "4457,4457,13.02.2026,IRS,IRS TOD/2Y RUB KeyRate,Pay Fixed,0.17,-14791.7,,13.02.2026,12.02.2028,1000000,RUB,1000000,RUB,\n"
        "4449,4449,11.02.2026,Cap,Cap TOM/3M RUB KeyRate R 16.5,Pay Fixed,0.012,21888.38,,12.02.2026,12.05.2026,50000000,RUB,50000000,RUB,0.165\n"
    )
    path = tmp_path / "trade.csv"
    path.write_text(csv_text, encoding="utf-8")

    portfolio, log = load_portfolio_from_csv(path)

    assert len(portfolio.positions) == 3
    assert log == []

    fwd = portfolio.positions[0]
    assert fwd.instrument_type.value == "forward"
    assert fwd.position_id == "6150"
    assert fwd.quantity == -1

    irs = portfolio.positions[1]
    assert irs.instrument_type.value == "swap_ir"
    assert irs.position_id == "4457"
    assert irs.quantity == -1
    assert irs.fixed_rate is not None

    cap = portfolio.positions[2]
    assert cap.instrument_type.value == "option"
    assert cap.option_type.value == "call"
    assert cap.position_id == "4449"
