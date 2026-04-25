from __future__ import annotations

import csv
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "test_data" / "data_api_completeness"

PORTFOLIO_COLUMNS = [
    "instrument_type",
    "position_id",
    "quantity",
    "notional",
    "underlying_symbol",
    "currency",
    "underlying_price",
    "strike",
    "volatility",
    "maturity_date",
    "valuation_date",
    "risk_free_rate",
    "option_type",
    "style",
    "dividend_yield",
    "liquidity_haircut",
    "model",
]


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=PORTFOLIO_COLUMNS)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def portfolio_row(position_id: str, currency: str, *, quantity: float = 1.0) -> dict[str, object]:
    return {
        "instrument_type": "forward",
        "position_id": position_id,
        "quantity": quantity,
        "notional": 1,
        "underlying_symbol": position_id.upper(),
        "currency": currency,
        "underlying_price": 100,
        "strike": 90,
        "volatility": 0,
        "maturity_date": "2026-12-31",
        "valuation_date": "2026-04-25",
        "risk_free_rate": 0.05,
        "option_type": "call",
        "style": "european",
        "dividend_yield": 0,
        "liquidity_haircut": 0,
        "model": "forward",
    }


def save_rows_xlsx(path: Path, headers: list[str], rows: list[list[object]]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = path.stem[:31]
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    workbook.save(path)
    workbook.close()


def write_required_market_files() -> None:
    save_rows_xlsx(
        DATA_DIR / "curveDiscount.xlsx",
        ["Дата", "Кривая", "Тип", "Дисконт фактор", "Тенор", "Ставка"],
        [["2026-04-25", "RUB-DISCOUNT-RUB-CSA", "Дисконтная", "1W", 0.0192, 0.9965]],
    )
    save_rows_xlsx(
        DATA_DIR / "curveForward.xlsx",
        ["Дата", "Кривая", "Тип", "Срок", "Тенор", "Ставка"],
        [["2026-04-25", "RUB-RUSFAR-OIS-COMPOUND", "Форвардная", "1W", 0.0192, 0.13]],
    )
    save_rows_xlsx(
        DATA_DIR / "fixing.xlsx",
        ["Индекс", "Фиксинг", "Дата"],
        [["RUONIA Avg.", 0.13, "2026-04-25"]],
    )


def write_fx_file(path: Path, pairs: list[tuple[str, float]]) -> None:
    save_rows_xlsx(
        path,
        ["pair", "date", "rate", "nominal"],
        [[pair, "2026-04-25", rate, 1] for pair, rate in pairs],
    )


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    write_csv(DATA_DIR / "portfolio_rub_only.csv", [portfolio_row("rub_forward", "RUB")])
    write_csv(DATA_DIR / "portfolio_usd_only.csv", [portfolio_row("usd_forward", "USD")])
    write_csv(DATA_DIR / "portfolio_eur_usd.csv", [portfolio_row("eur_forward", "EUR"), portfolio_row("usd_forward", "USD")])
    write_csv(
        DATA_DIR / "portfolio_usd_eur_gbp.csv",
        [portfolio_row("usd_forward", "USD"), portfolio_row("eur_forward", "EUR"), portfolio_row("gbp_forward", "GBP")],
    )
    write_csv(DATA_DIR / "portfolio_invalid_currency.csv", [portfolio_row("bad_currency", "USDX")])

    write_required_market_files()
    write_fx_file(DATA_DIR / "market_data_fx_full.xlsx", [("USD/RUB", 90.0), ("EUR/RUB", 100.0), ("GBP/RUB", 110.0)])
    write_fx_file(DATA_DIR / "market_data_fx_missing_usd.xlsx", [("EUR/RUB", 100.0), ("GBP/RUB", 110.0)])
    write_fx_file(DATA_DIR / "market_data_fx_missing_eur.xlsx", [("USD/RUB", 90.0), ("GBP/RUB", 110.0)])
    write_fx_file(
        DATA_DIR / "market_data_fx_aliases.xlsx",
        [("USDRUB", 90.0), ("EURRUB", 100.0), ("USD-RUB", 90.0), ("EUR-RUB", 100.0), ("USD_RUB", 90.0), ("EUR_RUB", 100.0)],
    )
    write_fx_file(DATA_DIR / "market_data_fx_inverse_pairs.xlsx", [("RUB/USD", 1 / 90.0), ("RUB/EUR", 1 / 100.0)])
    write_fx_file(DATA_DIR / "market_data_fx_wrong_inverse.xlsx", [("RUB/USD", 0.5), ("RUB/EUR", 0.5)])
    write_fx_file(DATA_DIR / "market_data_without_fx.xlsx", [])
    write_fx_file(DATA_DIR / "market_data_many_assets.xlsx", [("USD/RUB", 90.0), ("EUR/RUB", 100.0), ("GBP/RUB", 110.0)])

    for path in sorted(DATA_DIR.iterdir()):
        print(f"PASS generated {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
