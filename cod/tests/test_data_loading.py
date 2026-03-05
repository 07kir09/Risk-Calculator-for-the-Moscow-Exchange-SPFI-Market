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
