"""Формирование таблиц, графиков и экспортов."""
from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional

_MPL_CONFIG_DIR = Path(tempfile.gettempdir()) / "option_risk_mpl"
_MPL_CONFIG_DIR.mkdir(parents=True, exist_ok=True)

# На macOS/GUI-less окружениях pyplot может падать с Abort trap при выборе интерактивного backend.
# Жёстко переводим отчёты в headless-режим и уводим кэши в writable temp-директорию.
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(_MPL_CONFIG_DIR))
os.environ.setdefault("XDG_CACHE_HOME", str(_MPL_CONFIG_DIR))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from ..data.models import Portfolio
from ..data.validation import ValidationMessage
from ..risk.stress import StressResult


@dataclass
class PortfolioMetrics:
    base_value: float
    var_hist: float
    es_hist: float
    var_param: float
    es_param: float
    lc_var: float
    greeks: Dict[str, float]


def build_tables(
    portfolio: Portfolio,
    pnl_distribution: List[float],
    metrics: PortfolioMetrics,
    stress_results: List[StressResult],
    validation_log: List[ValidationMessage],
) -> Dict[str, pd.DataFrame]:
    """Готовит таблицы для отчета."""
    pnl_df = pd.DataFrame({"pnl": pnl_distribution})
    stress_df = pd.DataFrame([asdict(s) for s in stress_results])
    greeks_df = pd.DataFrame([metrics.greeks])
    metrics_df = pd.DataFrame(
        [
            {
                "base_value": metrics.base_value,
                "var_hist": metrics.var_hist,
                "es_hist": metrics.es_hist,
                "var_param": metrics.var_param,
                "es_param": metrics.es_param,
                "lc_var": metrics.lc_var,
            }
        ]
    )
    positions_df = pd.DataFrame([p.dict() for p in portfolio.positions])
    validation_df = pd.DataFrame([asdict(m) for m in validation_log]) if validation_log else pd.DataFrame()
    return {
        "pnl": pnl_df,
        "stress": stress_df,
        "greeks": greeks_df,
        "metrics": metrics_df,
        "positions": positions_df,
        "validation": validation_df,
    }


def save_csv(tables: Dict[str, pd.DataFrame], directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name, df in tables.items():
        path = directory / f"{name}.csv"
        df.to_csv(path, index=False)


def save_excel(tables: Dict[str, pd.DataFrame], path: Path) -> None:
    with pd.ExcelWriter(path) as writer:
        for name, df in tables.items():
            df.to_excel(writer, sheet_name=name[:31], index=False)


def save_json(tables: Dict[str, pd.DataFrame], path: Path) -> None:
    payload = {name: df.to_dict(orient="records") for name, df in tables.items()}
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


def plot_pnl_distribution(pnl_distribution: List[float], var: float, path: Optional[Path] = None) -> None:
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.hist(pnl_distribution, bins=40, color="#4a90e2", alpha=0.7)
    ax.axvline(-var, color="red", linestyle="--", label=f"VaR {var:.4f}")
    ax.set_xlabel("PNL")
    ax.set_ylabel("Частота")
    ax.legend()
    ax.grid(alpha=0.3)
    if path:
        fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
