"""Загрузка и валидация набора рыночных данных из Excel-файлов."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

import pandas as pd

from .validation import ValidationMessage


_FX_LABEL_TO_CODE = {
    "ЕВРО": "EUR",
    "ДОЛЛАР США": "USD",
    "КИТАЙСКИЙ ЮАНЬ": "CNY",
    "ЮАНЬ": "CNY",
}


@dataclass
class MarketDataBundle:
    fx_history: pd.DataFrame
    calibration_instruments: pd.DataFrame
    discount_curves: pd.DataFrame
    forward_curves: pd.DataFrame
    fixings: pd.DataFrame
    validation_log: List[ValidationMessage] = field(default_factory=list)

    def has_errors(self) -> bool:
        return any(msg.severity.upper() == "ERROR" for msg in self.validation_log)


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = [str(col).replace("\ufeff", "").strip() for col in out.columns]
    return out


def _add_message(
    messages: List[ValidationMessage],
    severity: str,
    message: str,
    *,
    row: int | None = None,
    field: str | None = None,
) -> None:
    messages.append(ValidationMessage(severity=severity, message=message, row=row, field=field))


def _read_excel(path: Path) -> pd.DataFrame:
    return _normalize_columns(pd.read_excel(path))


def _add_duplicate_message(
    messages: List[ValidationMessage],
    *,
    strict: bool,
    file_name: str,
    message: str,
    field: str | None = None,
) -> None:
    _add_message(messages, "ERROR" if strict else "WARNING", f"{file_name}: {message}", field=field)


def _find_single_market_file(base_dir: Path, stem: str) -> Path | None:
    for suffix in (".xlsx", ".xls"):
        candidate = base_dir / f"{stem}{suffix}"
        if candidate.exists():
            return candidate
    return None


def _parse_dates(
    series: pd.Series,
    *,
    messages: List[ValidationMessage],
    file_name: str,
    field_name: str,
) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce")
    bad_count = int(parsed.isna().sum())
    if bad_count:
        _add_message(
            messages,
            "ERROR",
            f"{file_name}: {bad_count} значений в поле {field_name} не распознаны как даты.",
            field=field_name,
        )
    return parsed


def _parse_numeric(
    series: pd.Series,
    *,
    messages: List[ValidationMessage],
    file_name: str,
    field_name: str,
) -> pd.Series:
    parsed = pd.to_numeric(series, errors="coerce")
    bad_count = int(parsed.isna().sum())
    if bad_count:
        _add_message(
            messages,
            "ERROR",
            f"{file_name}: {bad_count} значений в поле {field_name} не распознаны как числа.",
            field=field_name,
        )
    return parsed


def _require_columns(df: pd.DataFrame, required: list[str], *, messages: List[ValidationMessage], file_name: str) -> bool:
    missing = [col for col in required if col not in df.columns]
    if missing:
        _add_message(
            messages,
            "ERROR",
            f"{file_name}: отсутствуют обязательные колонки: {', '.join(missing)}.",
        )
        return False
    return True


def _numeric_ratio(series: pd.Series) -> float:
    parsed = pd.to_numeric(series, errors="coerce")
    if len(series) == 0:
        return 0.0
    return float(parsed.notna().sum()) / float(len(series))


def _load_discount_curves(path: Path, messages: List[ValidationMessage], *, strict: bool = True) -> pd.DataFrame:
    df = _read_excel(path)
    required = ["Дата", "Кривая", "Тип", "Дисконт фактор", "Тенор", "Ставка"]
    if not _require_columns(df, required, messages=messages, file_name=path.name):
        return pd.DataFrame(columns=["as_of_date", "curve_name", "curve_type", "tenor_label", "tenor_years", "discount_factor"])

    looks_like_swapped_layout = _numeric_ratio(df["Дисконт фактор"]) < 0.5 and _numeric_ratio(df["Ставка"]) > 0.8
    if looks_like_swapped_layout:
        _add_message(
            messages,
            "WARNING",
            (
                f"{path.name}: колонки распознаны как нестандартные. "
                "Поле 'Дисконт фактор' интерпретировано как tenor label, "
                "а поле 'Ставка' как discount factor."
            ),
        )
        tenor_label = df["Дисконт фактор"].astype(str).str.strip()
        tenor_years = _parse_numeric(df["Тенор"], messages=messages, file_name=path.name, field_name="Тенор")
        discount_factor = _parse_numeric(df["Ставка"], messages=messages, file_name=path.name, field_name="Ставка")
    else:
        tenor_label = df["Тенор"].astype(str).str.strip()
        tenor_years = _parse_numeric(df["Тенор"], messages=messages, file_name=path.name, field_name="Тенор")
        discount_factor = _parse_numeric(
            df["Дисконт фактор"], messages=messages, file_name=path.name, field_name="Дисконт фактор"
        )

    out = pd.DataFrame(
        {
            "as_of_date": _parse_dates(df["Дата"], messages=messages, file_name=path.name, field_name="Дата"),
            "curve_name": df["Кривая"].astype(str).str.strip(),
            "curve_type": df["Тип"].astype(str).str.strip(),
            "tenor_label": tenor_label,
            "tenor_years": tenor_years,
            "discount_factor": discount_factor,
            "source_file": path.name,
        }
    )
    duplicate_mask = out.duplicated(subset=["as_of_date", "curve_name", "curve_type", "tenor_label"], keep="last")
    dup_count = int(duplicate_mask.sum())
    if dup_count:
        _add_duplicate_message(
            messages,
            strict=strict,
            file_name=path.name,
            message=f"найдено {dup_count} дубликатов в discount curve по ключу дата/кривая/тип/tenor.",
        )
        if not strict:
            out = out.loc[~duplicate_mask].copy()
    return out.sort_values(["as_of_date", "curve_name", "tenor_years", "tenor_label"]).reset_index(drop=True)


def _load_forward_curves(path: Path, messages: List[ValidationMessage], *, strict: bool = True) -> pd.DataFrame:
    df = _read_excel(path)
    required = ["Дата", "Кривая", "Тип", "Срок", "Тенор", "Ставка"]
    if not _require_columns(df, required, messages=messages, file_name=path.name):
        return pd.DataFrame(columns=["as_of_date", "curve_name", "curve_type", "tenor_label", "tenor_years", "forward_rate"])

    out = pd.DataFrame(
        {
            "as_of_date": _parse_dates(df["Дата"], messages=messages, file_name=path.name, field_name="Дата"),
            "curve_name": df["Кривая"].astype(str).str.strip(),
            "curve_type": df["Тип"].astype(str).str.strip(),
            "tenor_label": df["Срок"].astype(str).str.strip(),
            "tenor_years": _parse_numeric(df["Тенор"], messages=messages, file_name=path.name, field_name="Тенор"),
            "forward_rate": _parse_numeric(df["Ставка"], messages=messages, file_name=path.name, field_name="Ставка"),
            "source_file": path.name,
        }
    )
    duplicate_mask = out.duplicated(subset=["as_of_date", "curve_name", "curve_type", "tenor_label"], keep="last")
    dup_count = int(duplicate_mask.sum())
    if dup_count:
        _add_duplicate_message(
            messages,
            strict=strict,
            file_name=path.name,
            message=f"найдено {dup_count} дубликатов в forward curve по ключу дата/кривая/тип/tenor.",
        )
        if not strict:
            out = out.loc[~duplicate_mask].copy()
    return out.sort_values(["as_of_date", "curve_name", "tenor_years", "tenor_label"]).reset_index(drop=True)


def _load_fixings(path: Path, messages: List[ValidationMessage], *, strict: bool = True) -> pd.DataFrame:
    df = _read_excel(path)
    required = ["Индекс", "Фиксинг", "Дата"]
    if not _require_columns(df, required, messages=messages, file_name=path.name):
        return pd.DataFrame(columns=["index_name", "fixing", "as_of_date"])

    out = pd.DataFrame(
        {
            "index_name": df["Индекс"].astype(str).str.strip(),
            "fixing": _parse_numeric(df["Фиксинг"], messages=messages, file_name=path.name, field_name="Фиксинг"),
            "as_of_date": _parse_dates(df["Дата"], messages=messages, file_name=path.name, field_name="Дата"),
            "source_file": path.name,
        }
    )
    duplicate_mask = out.duplicated(subset=["index_name", "as_of_date"], keep="last")
    dup_count = int(duplicate_mask.sum())
    if dup_count:
        _add_duplicate_message(
            messages,
            strict=strict,
            file_name=path.name,
            message=f"найдено {dup_count} дубликатов фиксингов по ключу индекс/дата.",
        )
        if not strict:
            out = out.loc[~duplicate_mask].copy()
    return out.sort_values(["index_name", "as_of_date"]).reset_index(drop=True)


def _load_calibration_files(base_dir: Path, messages: List[ValidationMessage]) -> pd.DataFrame:
    files = sorted([*base_dir.glob("calibrationInstrument*.xlsx"), *base_dir.glob("calibrationInstrument*.xls")])
    frames: list[pd.DataFrame] = []
    if not files:
        _add_message(messages, "WARNING", f"{base_dir.name}: не найдено ни одного calibrationInstrument*.xlsx.")
        return pd.DataFrame(columns=["instrument_name", "product", "tenor_label", "quote", "as_of_date", "source_file"])

    for path in files:
        df = _read_excel(path)
        required = ["Инструмент", "Продукт", "Срок", "Котировка", "Дата"]
        if not _require_columns(df, required, messages=messages, file_name=path.name):
            continue
        frames.append(
            pd.DataFrame(
                {
                    "instrument_name": df["Инструмент"].astype(str).str.strip(),
                    "product": df["Продукт"].astype(str).str.strip(),
                    "tenor_label": df["Срок"].astype(str).str.strip(),
                    "quote": _parse_numeric(df["Котировка"], messages=messages, file_name=path.name, field_name="Котировка"),
                    "as_of_date": _parse_dates(df["Дата"], messages=messages, file_name=path.name, field_name="Дата"),
                    "source_file": path.name,
                }
            )
        )
    if not frames:
        return pd.DataFrame(columns=["instrument_name", "product", "tenor_label", "quote", "as_of_date", "source_file"])
    return pd.concat(frames, ignore_index=True).sort_values(["as_of_date", "product", "tenor_label"]).reset_index(drop=True)


def _currency_from_filename(path: Path) -> str | None:
    match = re.search(r"\b([A-Z]{3})\.xlsx$", path.name)
    return match.group(1) if match else None


def _load_fx_history_files(base_dir: Path, messages: List[ValidationMessage], *, strict: bool = True) -> pd.DataFrame:
    files = sorted([*base_dir.glob("RC_*.xlsx"), *base_dir.glob("RC_*.xls")])
    frames: list[pd.DataFrame] = []
    fingerprints: dict[str, str] = {}
    if not files:
        _add_message(messages, "WARNING", f"{base_dir.name}: не найдено ни одного RC_*.xlsx.")
        return pd.DataFrame(columns=["currency_code", "currency_label", "nominal", "obs_date", "rate", "source_file"])

    for path in files:
        df = _read_excel(path)
        required = ["nominal", "data", "curs", "cdx"]
        if not _require_columns(df, required, messages=messages, file_name=path.name):
            continue

        currency_code_from_filename = _currency_from_filename(path) or "UNK"
        currency_code = currency_code_from_filename
        labels = sorted({str(value).strip() for value in df["cdx"].dropna().unique() if str(value).strip()})
        if len(labels) == 1:
            inferred = _FX_LABEL_TO_CODE.get(labels[0].upper())
            if inferred and inferred != currency_code_from_filename:
                _add_message(
                    messages,
                    "ERROR" if strict else "WARNING",
                    (
                        f"{path.name}: код валюты в имени файла ({currency_code_from_filename}) "
                        f"не совпадает с содержимым файла ({labels[0]} -> {inferred})."
                        + (" Для tolerant-режима используется код из содержимого файла." if not strict else "")
                    ),
                    field="cdx",
                )
                if not strict:
                    currency_code = inferred

        out = pd.DataFrame(
            {
                "currency_code": currency_code,
                "currency_label": df["cdx"].astype(str).str.strip(),
                "nominal": _parse_numeric(df["nominal"], messages=messages, file_name=path.name, field_name="nominal"),
                "obs_date": _parse_dates(df["data"], messages=messages, file_name=path.name, field_name="data"),
                "rate": _parse_numeric(df["curs"], messages=messages, file_name=path.name, field_name="curs"),
                "source_file": path.name,
            }
        ).sort_values(["obs_date"]).reset_index(drop=True)

        duplicate_mask = out.duplicated(subset=["obs_date"], keep="last")
        dup_count = int(duplicate_mask.sum())
        if dup_count:
            _add_duplicate_message(
                messages,
                strict=strict,
                file_name=path.name,
                message=f"найдено {dup_count} дубликатов FX history по дате.",
                field="data",
            )
            if not strict:
                out = out.loc[~duplicate_mask].copy()

        payload = out[["nominal", "obs_date", "rate"]].to_csv(index=False)
        fingerprint = hashlib.md5(payload.encode("utf-8")).hexdigest()
        if fingerprint in fingerprints and fingerprints[fingerprint] != path.name:
            _add_message(
                messages,
                "ERROR" if strict else "WARNING",
                f"{path.name}: FX history полностью совпадает с {fingerprints[fingerprint]}.",
            )
            if not strict:
                continue
        else:
            fingerprints[fingerprint] = path.name

        frames.append(out)

    if not frames:
        return pd.DataFrame(columns=["currency_code", "currency_label", "nominal", "obs_date", "rate", "source_file"])
    return pd.concat(frames, ignore_index=True).sort_values(["currency_code", "obs_date"]).reset_index(drop=True)


def load_market_data_bundle_from_directory(base_dir: Path, *, strict: bool = True) -> MarketDataBundle:
    base_dir = Path(base_dir)
    if not base_dir.exists():
        raise ValueError(f"Каталог с market data не найден: {base_dir}")
    if not base_dir.is_dir():
        raise ValueError(f"Ожидается каталог с market data, получен файл: {base_dir}")

    messages: List[ValidationMessage] = []

    discount_path = _find_single_market_file(base_dir, "curveDiscount")
    forward_path = _find_single_market_file(base_dir, "curveForward")
    fixing_path = _find_single_market_file(base_dir, "fixing")
    required_files = {
        "curveDiscount.xlsx": discount_path,
        "curveForward.xlsx": forward_path,
        "fixing.xlsx": fixing_path,
    }
    for display_name, required_path in required_files.items():
        if required_path is None:
            _add_message(messages, "ERROR", f"{base_dir.name}: отсутствует обязательный файл {display_name}.")

    discount_curves = _load_discount_curves(discount_path, messages, strict=strict) if discount_path is not None else pd.DataFrame()
    forward_curves = _load_forward_curves(forward_path, messages, strict=strict) if forward_path is not None else pd.DataFrame()
    fixings = _load_fixings(fixing_path, messages, strict=strict) if fixing_path is not None else pd.DataFrame()
    calibration_instruments = _load_calibration_files(base_dir, messages)
    fx_history = _load_fx_history_files(base_dir, messages, strict=strict)

    return MarketDataBundle(
        fx_history=fx_history,
        calibration_instruments=calibration_instruments,
        discount_curves=discount_curves,
        forward_curves=forward_curves,
        fixings=fixings,
        validation_log=messages,
    )


__all__ = ["MarketDataBundle", "load_market_data_bundle_from_directory"]
