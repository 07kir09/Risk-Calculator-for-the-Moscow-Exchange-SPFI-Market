from pathlib import Path

from option_risk.data.loading import load_portfolio_from_csv


def test_load_portfolio_from_csv_treats_blank_optional_swap_fields_as_missing(tmp_path: Path):
    csv_content = """position_id,quantity,underlying_symbol,underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,currency,fixed_rate,float_rate,day_count
pos_1,1,TEST,100,100,0.2,2027-01-01,2026-01-01,0.05,RUB,,,
"""
    file_path = tmp_path / "portfolio.csv"
    file_path.write_text(csv_content, encoding="utf-8")

    portfolio, messages = load_portfolio_from_csv(file_path)

    assert len(portfolio.positions) == 1
    assert messages == []
