from pathlib import Path

import pandas as pd

from option_risk.data.market_data import load_market_data_bundle_from_directory


def _write_xlsx(path: Path, df: pd.DataFrame) -> None:
    df.to_excel(path, index=False)


def test_tolerant_loader_deduplicates_problematic_bundle(tmp_path: Path):
    _write_xlsx(
        tmp_path / "curveDiscount.xlsx",
        pd.DataFrame(
            [
                {
                    "Дата": "2025-09-01",
                    "Кривая": "RUB-DISCOUNT-RUB-CSA",
                    "Тип": "Дисконтная",
                    "Дисконт фактор": "1W",
                    "Тенор": 0.0192,
                    "Ставка": 0.99658838,
                },
                {
                    "Дата": "2025-09-01",
                    "Кривая": "RUB-DISCOUNT-RUB-CSA",
                    "Тип": "Дисконтная",
                    "Дисконт фактор": "1W",
                    "Тенор": 0.0192,
                    "Ставка": 0.99658838,
                },
            ]
        ),
    )
    _write_xlsx(
        tmp_path / "curveForward.xlsx",
        pd.DataFrame(
            [
                {
                    "Дата": "2025-09-01",
                    "Кривая": "RUB-RUSFAR-OIS-COMPOUND",
                    "Тип": "Форвардная",
                    "Срок": "1W",
                    "Тенор": 0.0192,
                    "Ставка": 0.1766,
                }
            ]
        ),
    )
    _write_xlsx(
        tmp_path / "fixing.xlsx",
        pd.DataFrame(
            [
                {"Индекс": "RUONIA Avg.", "Фиксинг": 0.1479, "Дата": "2025-09-01"},
                {"Индекс": "RUONIA Avg.", "Фиксинг": 0.1479, "Дата": "2025-09-01"},
            ]
        ),
    )
    _write_xlsx(
        tmp_path / "RC_F01_09_2025_T21_03_2026 EUR.xlsx",
        pd.DataFrame([{"nominal": 1, "data": "2025-09-01", "curs": 97.2886, "cdx": "Евро"}]),
    )
    _write_xlsx(
        tmp_path / "RC_F01_09_2025_T21_03_2026 CNY.xlsx",
        pd.DataFrame([{"nominal": 1, "data": "2025-09-01", "curs": 97.2886, "cdx": "Евро"}]),
    )

    bundle = load_market_data_bundle_from_directory(tmp_path, strict=False)

    assert bundle.has_errors() is False
    assert len(bundle.discount_curves) == 1
    assert len(bundle.fixings) == 1
    assert len(bundle.fx_history) == 1
    assert any(msg.severity == "WARNING" for msg in bundle.validation_log)
