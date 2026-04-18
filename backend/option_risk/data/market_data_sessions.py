"""Session storage for incremental market-data uploads from UI/API."""
from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from .market_data import MarketDataBundle, load_market_data_bundle_from_directory
from .validation import ValidationMessage

MarketDataFileKind = Literal["curve_discount", "curve_forward", "fixing", "calibration", "fx_history"]

_REQUIRED_DISPLAY_NAMES = ("curveDiscount.xlsx", "curveForward.xlsx", "fixing.xlsx")
_REQUIRED_KINDS: dict[str, MarketDataFileKind] = {
    "curveDiscount.xlsx": "curve_discount",
    "curveForward.xlsx": "curve_forward",
    "fixing.xlsx": "fixing",
}


@dataclass
class UploadedMarketDataFile:
    filename: str
    kind: MarketDataFileKind
    size_bytes: int


@dataclass
class MarketDataSessionSummary:
    session_id: str
    files: list[UploadedMarketDataFile] = field(default_factory=list)
    missing_required_files: list[str] = field(default_factory=list)
    blocking_errors: int = 0
    warnings: int = 0
    ready: bool = False
    validation_log: list[ValidationMessage] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)


def _sessions_root() -> Path:
    configured = os.environ.get("OPTION_RISK_MARKET_SESSION_ROOT")
    if configured:
        return Path(configured)
    return Path(tempfile.gettempdir()) / "option_risk_market_data_sessions"


def _default_datasets_dir() -> Path:
    configured = os.environ.get("OPTION_RISK_DEFAULT_DATASETS_DIR")
    if configured:
        return Path(configured)
    repo_root = Path(__file__).resolve().parents[3]
    candidates = [
        repo_root / "datasets" / "Данные для работы",
        repo_root / "datasets",
        repo_root / "Datasets",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def _session_dir(session_id: str) -> Path:
    return _sessions_root() / session_id


def create_market_data_session() -> str:
    session_id = uuid.uuid4().hex
    session_dir = _session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_id


def clear_market_data_session(session_id: str) -> None:
    shutil.rmtree(_session_dir(session_id), ignore_errors=True)


def classify_market_data_filename(filename: str) -> MarketDataFileKind | None:
    name = Path(filename).name
    lower = name.lower()
    if lower in {"curvediscount.xlsx", "curvediscount.xls"}:
        return "curve_discount"
    if lower in {"curveforward.xlsx", "curveforward.xls"}:
        return "curve_forward"
    if lower in {"fixing.xlsx", "fixing.xls"}:
        return "fixing"
    if lower.startswith("calibrationinstrument") and lower.endswith((".xlsx", ".xls")):
        return "calibration"
    if lower.startswith("rc_") and lower.endswith((".xlsx", ".xls")):
        return "fx_history"
    return None


def _list_session_files(session_dir: Path) -> list[UploadedMarketDataFile]:
    files: list[UploadedMarketDataFile] = []
    if not session_dir.exists():
        return files
    for path in sorted(p for p in session_dir.iterdir() if p.is_file()):
        kind = classify_market_data_filename(path.name)
        if kind is None:
            continue
        files.append(UploadedMarketDataFile(filename=path.name, kind=kind, size_bytes=path.stat().st_size))
    return files


def _counts_from_bundle(bundle: MarketDataBundle) -> dict[str, int]:
    return {
        "discount_curves": len(bundle.discount_curves),
        "forward_curves": len(bundle.forward_curves),
        "fixings": len(bundle.fixings),
        "calibration_instruments": len(bundle.calibration_instruments),
        "fx_history": len(bundle.fx_history),
    }


def summarize_market_data_session(session_id: str) -> MarketDataSessionSummary:
    session_dir = _session_dir(session_id)
    files = _list_session_files(session_dir)
    if not session_dir.exists() or not files:
        return MarketDataSessionSummary(
            session_id=session_id,
            files=files,
            missing_required_files=list(_REQUIRED_DISPLAY_NAMES),
            counts=_counts_from_bundle(
                MarketDataBundle(
                    fx_history=_empty_frame(),
                    calibration_instruments=_empty_frame(),
                    discount_curves=_empty_frame(),
                    forward_curves=_empty_frame(),
                    fixings=_empty_frame(),
                    validation_log=[],
                )
            ),
        )

    bundle = load_market_data_bundle_from_directory(session_dir, strict=False)
    available_kinds = {file.kind for file in files}
    missing_required_files = [name for name, kind in _REQUIRED_KINDS.items() if kind not in available_kinds]
    blocking_errors = sum(1 for message in bundle.validation_log if message.severity.upper() == "ERROR")
    warnings = sum(1 for message in bundle.validation_log if message.severity.upper() == "WARNING")
    return MarketDataSessionSummary(
        session_id=session_id,
        files=files,
        missing_required_files=missing_required_files,
        blocking_errors=blocking_errors,
        warnings=warnings,
        ready=not missing_required_files and blocking_errors == 0,
        validation_log=bundle.validation_log,
        counts=_counts_from_bundle(bundle),
    )


def store_market_data_file(session_id: str, filename: str, content: bytes) -> MarketDataSessionSummary:
    safe_name = Path(filename).name
    kind = classify_market_data_filename(safe_name)
    if kind is None:
        raise ValueError(
            "Файл не распознан как market data bundle. Поддерживаются curveDiscount, curveForward, fixing, calibrationInstrument*, RC_*. "
        )

    session_dir = _session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    target = session_dir / safe_name
    target.write_bytes(content)
    return summarize_market_data_session(session_id)


def populate_market_data_session_from_directory(session_id: str, source_dir: Path) -> MarketDataSessionSummary:
    if not source_dir.exists():
        raise ValueError(f"Каталог с market data не найден: {source_dir}")
    if not source_dir.is_dir():
        raise ValueError(f"Ожидается каталог с market data, получен файл: {source_dir}")

    session_dir = _session_dir(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    for path in sorted(source_dir.iterdir()):
        if not path.is_file():
            continue
        if classify_market_data_filename(path.name) is None:
            continue
        shutil.copy2(path, session_dir / path.name)
    return summarize_market_data_session(session_id)


def create_session_from_default_datasets() -> MarketDataSessionSummary:
    session_id = create_market_data_session()
    return populate_market_data_session_from_directory(session_id, _default_datasets_dir())


def load_market_data_bundle_for_session(session_id: str) -> tuple[MarketDataBundle, MarketDataSessionSummary]:
    summary = summarize_market_data_session(session_id)
    if summary.blocking_errors > 0 or summary.missing_required_files:
        missing = ", ".join(summary.missing_required_files) if summary.missing_required_files else "—"
        raise ValueError(
            f"Market data bundle не готов. Отсутствуют обязательные файлы: {missing}. "
            f"Блокирующих ошибок: {summary.blocking_errors}."
        )
    bundle = load_market_data_bundle_from_directory(_session_dir(session_id), strict=False)
    return bundle, summary


def _empty_frame():
    import pandas as pd

    return pd.DataFrame()


__all__ = [
    "MarketDataSessionSummary",
    "UploadedMarketDataFile",
    "classify_market_data_filename",
    "clear_market_data_session",
    "create_market_data_session",
    "create_session_from_default_datasets",
    "load_market_data_bundle_for_session",
    "populate_market_data_session_from_directory",
    "store_market_data_file",
    "summarize_market_data_session",
]
