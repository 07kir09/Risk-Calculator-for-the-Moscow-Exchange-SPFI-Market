from __future__ import annotations

import csv
from io import BytesIO
from pathlib import Path

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
TEST_DATA = ROOT / "test_data"
REPORTS = ROOT / "reports"


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


def write_csv(path: Path, rows: list[dict[str, object]], columns: list[str] = PORTFOLIO_COLUMNS) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def save_workbook(path: Path, workbook: Workbook) -> None:
    workbook.save(path)
    workbook.close()


def workbook_with_rows(row_count: int, *, write_only: bool = False) -> Workbook:
    workbook = Workbook(write_only=write_only)
    sheet = workbook.create_sheet("curveDiscount") if write_only else workbook.active
    sheet.title = "curveDiscount"
    sheet.append(["Дата", "Кривая", "Тип", "Дисконт фактор", "Тенор", "Ставка"])
    for index in range(max(0, row_count - 1)):
        sheet.append(["2026-04-25", "RUB-DISCOUNT-RUB-CSA", "Дисконтная", f"{index + 1}D", (index + 1) / 365, 0.99])
    return workbook


def create_portfolios() -> list[tuple[str, str, str]]:
    valid_rows = [
        {
            "instrument_type": "option",
            "position_id": "audit_option_call_1",
            "quantity": 2,
            "notional": 1,
            "underlying_symbol": "SBER",
            "currency": "RUB",
            "underlying_price": 300,
            "strike": 310,
            "volatility": 0.24,
            "maturity_date": "2026-12-31",
            "valuation_date": "2026-04-25",
            "risk_free_rate": 0.13,
            "option_type": "call",
            "style": "european",
            "dividend_yield": 0.02,
            "liquidity_haircut": 0.02,
            "model": "black_scholes",
        },
        {
            "instrument_type": "option",
            "position_id": "audit_option_put_1",
            "quantity": -1,
            "notional": 1,
            "underlying_symbol": "GAZP",
            "currency": "RUB",
            "underlying_price": 165,
            "strike": 150,
            "volatility": 0.28,
            "maturity_date": "2026-10-30",
            "valuation_date": "2026-04-25",
            "risk_free_rate": 0.13,
            "option_type": "put",
            "style": "european",
            "dividend_yield": 0.03,
            "liquidity_haircut": 0.02,
            "model": "black_scholes",
        },
        {
            "instrument_type": "forward",
            "position_id": "audit_forward_1",
            "quantity": 1,
            "notional": 1000,
            "underlying_symbol": "IMOEX",
            "currency": "RUB",
            "underlying_price": 3400,
            "strike": 3350,
            "volatility": 0,
            "maturity_date": "2026-09-30",
            "valuation_date": "2026-04-25",
            "risk_free_rate": 0.12,
            "option_type": "call",
            "style": "european",
            "dividend_yield": 0,
            "liquidity_haircut": 0.01,
            "model": "forward",
        },
    ]
    write_csv(TEST_DATA / "portfolio_minimal_valid.csv", valid_rows)

    write_csv(
        TEST_DATA / "portfolio_invalid_missing_columns.csv",
        [{"position_id": "missing_type", "quantity": 1}],
        columns=["position_id", "quantity"],
    )

    bad_types = [dict(valid_rows[0], quantity="not-a-number", underlying_price="abc", strike="xyz")]
    write_csv(TEST_DATA / "portfolio_invalid_types.csv", bad_types)

    edge_rows = [
        dict(
            valid_rows[0],
            position_id="very_long_instrument_name_" + "x" * 160,
            quantity=-123456789,
            underlying_price="123.123456789012345",
            strike="100.000000000000001",
            volatility="",
            liquidity_haircut="",
        ),
        dict(valid_rows[1], position_id="zero_price_edge", underlying_price=0),
        dict(valid_rows[2], position_id="large_position_edge", quantity=10_000_000, notional=100_000),
    ]
    write_csv(TEST_DATA / "portfolio_edge_values.csv", edge_rows)

    return [
        ("portfolio_minimal_valid.csv", "Small valid portfolio", "Import/metrics should pass."),
        ("portfolio_invalid_missing_columns.csv", "Missing required columns", "Inline validation error, no crash."),
        ("portfolio_invalid_types.csv", "Text in numeric fields", "Inline validation error, no crash."),
        ("portfolio_edge_values.csv", "Edge values", "Clear validation for impossible values; accepted rows remain inspectable."),
    ]


def create_market_data() -> list[tuple[str, str, str]]:
    save_workbook(TEST_DATA / "market_data_valid_small.xlsx", workbook_with_rows(5))
    (TEST_DATA / "market_data_empty.xlsx").write_bytes(b"")
    save_workbook(TEST_DATA / "market_data_5000_rows.xlsx", workbook_with_rows(5000))
    save_workbook(TEST_DATA / "market_data_5001_rows.xlsx", workbook_with_rows(5001))
    save_workbook(TEST_DATA / "market_data_write_only_5001_rows.xlsx", workbook_with_rows(5001, write_only=True))
    (TEST_DATA / "corrupted.xlsx").write_bytes(b"not an xlsx archive")

    return [
        ("market_data_valid_small.xlsx", "Small curveDiscount upload", "HTTP 200, session created but not ready until all required files are uploaded."),
        ("market_data_empty.xlsx", "Empty upload body", "HTTP 400 clean JSON error."),
        ("market_data_5000_rows.xlsx", "Row-limit boundary", "HTTP 200."),
        ("market_data_5001_rows.xlsx", "Row-limit violation", "HTTP 400 clean JSON error."),
        ("market_data_write_only_5001_rows.xlsx", "write_only row-limit bypass regression", "HTTP 400 clean JSON error."),
        ("corrupted.xlsx", "Corrupted XLSX", "HTTP 400 clean JSON error, no stack trace."),
    ]


def write_report(rows: list[tuple[str, str, str]]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Test data report",
        "",
        "| Файл | Для чего нужен | Ожидаемое поведение |",
        "| --- | --- | --- |",
    ]
    for filename, scenario, expected in rows:
        lines.append(f"| `{filename}` | {scenario} | {expected} |")
    (REPORTS / "test_data_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    TEST_DATA.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    rows = create_portfolios() + create_market_data()
    write_report(rows)
    for filename, scenario, expected in rows:
        print(f"PASS generated {filename} {scenario} -> {expected}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

