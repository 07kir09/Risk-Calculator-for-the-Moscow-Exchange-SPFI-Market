from pathlib import Path

import pandas as pd

from option_risk.data.market_data import load_market_data_bundle_from_directory


def _write_xlsx(path: Path, df: pd.DataFrame) -> None:
    df.to_excel(path, index=False)


def _write_minimal_bundle(base_dir: Path) -> None:
    _write_xlsx(
        base_dir / "curveDiscount.xlsx",
        pd.DataFrame(
            [
                {
                    "Дата": "2025-09-01",
                    "Кривая": "RUB-DISCOUNT-RUB-CSA",
                    "Тип": "Дисконтная",
                    "Дисконт фактор": "1W",
                    "Тенор": 0.0192,
                    "Ставка": 0.99658838,
                }
            ]
        ),
    )
    _write_xlsx(
        base_dir / "curveForward.xlsx",
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
        base_dir / "fixing.xlsx",
        pd.DataFrame([{"Индекс": "RUONIA Avg.", "Фиксинг": 0.1479, "Дата": "2025-09-01"}]),
    )
    _write_xlsx(
        base_dir / "calibrationInstrument SEP2025.xlsx",
        pd.DataFrame(
            [
                {
                    "Инструмент": "OIS Tom/10Y. RusFar RUB O/N",
                    "Продукт": "OIS",
                    "Срок": "10Y",
                    "Котировка": 0.1377,
                    "Дата": "2025-09-01",
                }
            ]
        ),
    )


def test_load_market_data_bundle_normalizes_discount_curve_layout(tmp_path: Path):
    _write_minimal_bundle(tmp_path)
    _write_xlsx(
        tmp_path / "RC_F01_09_2025_T21_03_2026 USD.xlsx",
        pd.DataFrame(
            [
                {"nominal": 1, "data": "2025-09-01", "curs": 80.4261, "cdx": "Доллар США"},
                {"nominal": 1, "data": "2025-09-02", "curs": 80.5000, "cdx": "Доллар США"},
            ]
        ),
    )

    bundle = load_market_data_bundle_from_directory(tmp_path)

    assert len(bundle.discount_curves) == 1
    row = bundle.discount_curves.iloc[0]
    assert row["tenor_label"] == "1W"
    assert row["tenor_years"] == 0.0192
    assert row["discount_factor"] == 0.99658838
    assert len(bundle.forward_curves) == 1
    assert len(bundle.fixings) == 1
    assert len(bundle.calibration_instruments) == 1
    assert len(bundle.fx_history) == 2
    assert any("нестандартные" in msg.message for msg in bundle.validation_log)


def test_load_market_data_bundle_detects_rc_currency_mismatch(tmp_path: Path):
    _write_minimal_bundle(tmp_path)
    _write_xlsx(
        tmp_path / "RC_F01_09_2025_T21_03_2026 CNY.xlsx",
        pd.DataFrame([{"nominal": 1, "data": "2025-09-01", "curs": 94.3841, "cdx": "Евро"}]),
    )

    bundle = load_market_data_bundle_from_directory(tmp_path)

    assert bundle.has_errors()
    assert any("не совпадает с содержимым файла" in msg.message for msg in bundle.validation_log)


def test_load_market_data_bundle_detects_duplicate_fixings(tmp_path: Path):
    _write_minimal_bundle(tmp_path)
    _write_xlsx(
        tmp_path / "RC_F01_09_2025_T21_03_2026 USD.xlsx",
        pd.DataFrame([{"nominal": 1, "data": "2025-09-01", "curs": 80.4261, "cdx": "Доллар США"}]),
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

    bundle = load_market_data_bundle_from_directory(tmp_path)

    assert bundle.has_errors()
    assert any("дубликатов фиксингов" in msg.message for msg in bundle.validation_log)
