"""CLI для риск-калькулятора опционов."""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import List

from .data.bootstrap import build_bootstrapped_market_data
from .data.loading import (
    load_portfolio_from_csv,
    load_portfolio_from_json,
    load_scenarios_from_csv,
    load_scenarios_from_json,
)
from .data.market_data import MarketDataBundle, load_market_data_bundle_from_directory
from .data.models import MarketScenario, Portfolio
from .data.validation import ValidationMessage
from .risk.pipeline import CalculationConfig, run_calculation


def _default_scenarios() -> List[MarketScenario]:
    shocks = [-0.1, -0.05, -0.02, 0.0, 0.02, 0.05, 0.1]
    scenarios = []
    for idx, shock in enumerate(shocks):
        scenarios.append(
            MarketScenario(
                scenario_id=f"shock_{idx}",
                underlying_shift=shock,
                volatility_shift=shock * 0.5,
                rate_shift=0.0,
            )
        )
    return scenarios


def _load_portfolio(
    path: Path,
    *,
    market_bootstrap=None,
) -> tuple[Portfolio, List[ValidationMessage]]:
    if path.suffix.lower() == ".csv":
        return load_portfolio_from_csv(path, market_bootstrap=market_bootstrap)
    if path.suffix.lower() == ".json":
        return load_portfolio_from_json(path)
    raise ValueError("Поддерживаются только CSV или JSON для портфеля")


def _load_scenarios(path: Path | None) -> List[MarketScenario]:
    if path is None:
        return _default_scenarios()
    if path.suffix.lower() == ".csv":
        return load_scenarios_from_csv(path)
    if path.suffix.lower() == ".json":
        return load_scenarios_from_json(path)
    raise ValueError("Поддерживаются только CSV или JSON для сценариев")


def _load_limits(path: Path | None) -> dict:
    if path is None:
        return {}
    import json

    return json.loads(Path(path).read_text())


def _print_market_data_bundle_summary(bundle: MarketDataBundle) -> None:
    print("Market data bundle:")
    print("  discount_curves:", len(bundle.discount_curves))
    print("  forward_curves:", len(bundle.forward_curves))
    print("  fixings:", len(bundle.fixings))
    print("  calibration_instruments:", len(bundle.calibration_instruments))
    print("  fx_history:", len(bundle.fx_history))
    if not bundle.validation_log:
        print("  validation_log: no findings")
        return
    print("  validation_log:")
    for msg in bundle.validation_log:
        suffix = ""
        if msg.field:
            suffix += f" field={msg.field}"
        if msg.row is not None:
            suffix += f" row={msg.row}"
        print(f"    - [{msg.severity}] {msg.message}{suffix}")


def main() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Риск-калькулятор опционов (портфельный)")
    parser.add_argument("--portfolio", type=Path, default=base_dir / "examples" / "portfolio.csv", help="Путь к файлу портфеля (CSV/JSON)")
    parser.add_argument("--scenarios", type=Path, default=None, help="Путь к файлу сценариев (CSV/JSON). Если не задан — используются встроенные шоки.")
    parser.add_argument("--output", type=Path, default=base_dir / "output", help="Каталог для выгрузок")
    parser.add_argument("--limits", type=Path, default=None, help="JSON с лимитами вида {\"var_hist\": 100000, \"es_hist\": 120000}")
    parser.add_argument("--market-data-dir", type=Path, default=None, help="Каталог с Excel market data bundle (curveForward/curveDiscount/fixing/RC/calibrationInstrument)")
    parser.add_argument("--validate-market-data-only", action="store_true", help="Проверить Excel market data bundle и завершить без расчёта портфеля")
    parser.add_argument(
        "--parametric-tail-model",
        type=str,
        default="normal",
        choices=["normal", "cornish_fisher"],
        help="Tail-модель для параметрического VaR/ES (normal|cornish_fisher)",
    )
    parser.add_argument("--no-var", action="store_true", help="Не считать VaR/ES")
    parser.add_argument("--no-stress", action="store_true", help="Не считать стресс-сценарии")
    parser.add_argument("--no-margin", action="store_true", help="Не считать маржу/капитал")
    args = parser.parse_args()

    market_data_bundle = None
    bootstrapped_market_data = None
    market_context = None
    if args.market_data_dir is not None:
        market_data_bundle = load_market_data_bundle_from_directory(args.market_data_dir)
        _print_market_data_bundle_summary(market_data_bundle)
        if args.validate_market_data_only:
            raise SystemExit(1 if market_data_bundle.has_errors() else 0)
        bootstrapped_market_data = build_bootstrapped_market_data(market_data_bundle)
        market_context = bootstrapped_market_data.market_context
    elif args.validate_market_data_only:
        raise SystemExit("Для --validate-market-data-only нужно указать --market-data-dir")

    portfolio_path = args.portfolio
    portfolio, validation_log = _load_portfolio(portfolio_path, market_bootstrap=bootstrapped_market_data)
    if bootstrapped_market_data is not None and bootstrapped_market_data.validation_log:
        validation_log = validation_log + bootstrapped_market_data.validation_log
    scenarios = _load_scenarios(args.scenarios)
    limits = _load_limits(args.limits)

    from .reporting.generator import (
        PortfolioMetrics,
        build_tables,
        plot_pnl_distribution,
        save_csv,
        save_excel,
        save_json,
    )

    cfg = CalculationConfig(
        calc_sensitivities=True,
        calc_var_es=not args.no_var,
        calc_stress=not args.no_stress,
        calc_margin_capital=not args.no_margin,
        parametric_tail_model=args.parametric_tail_model,
    )
    result = run_calculation(portfolio, scenarios, limits, cfg, market=market_context)

    metrics = PortfolioMetrics(
        base_value=result.base_value,
        var_hist=result.var_hist or 0.0,
        es_hist=result.es_hist or 0.0,
        var_param=result.var_param or 0.0,
        es_param=result.es_param or 0.0,
        lc_var=result.lc_var or 0.0,
        greeks=result.greeks or {},
    )
    tables = build_tables(
        portfolio,
        result.pnl_distribution or [],
        metrics,
        result.stress or [],
        validation_log + (result.validation_log or []),
    )
    if result.limits:
        import pandas as pd

        tables["limits"] = pd.DataFrame(
            [
                {
                    "metric": name,
                    "value": value,
                    "limit": limit,
                    "breached": breached,
                }
                for (name, value, limit, breached) in result.limits
            ]
        )
    out_dir = args.output
    out_dir.mkdir(parents=True, exist_ok=True)
    save_csv(tables, out_dir / "csv")
    save_excel(tables, out_dir / "report.xlsx")
    save_json(tables, out_dir / "report.json")
    if result.var_hist is not None and result.pnl_distribution:
        plot_pnl_distribution(result.pnl_distribution, result.var_hist, out_dir / "pnl_hist.png")

    print("Базовая стоимость портфеля:", result.base_value)
    if result.var_hist is not None:
        print("VaR (hist):", result.var_hist)
        print("ES (hist):", result.es_hist)
    if result.var_param is not None:
        print("VaR (param):", result.var_param)
        print("ES (param):", result.es_param)
    if result.lc_var is not None:
        print("LC VaR:", result.lc_var)
    if result.greeks:
        print("Греки:", result.greeks)
    if validation_log:
        print("Замечания валидации:")
        for msg in validation_log:
            prefix = f"- [{msg.severity}]"
            if msg.row is not None:
                prefix += f" строка {msg.row}:"
            else:
                prefix += ""
            print(f"{prefix} {msg.message}")
    if market_data_bundle is not None:
        print(
            "Примечание: Excel market data bundle провалидирован; OIS и IRS/FRA curves перестраиваются из calibrationInstrument, "
            "forward curves дополняются latest fixings, а trade-import автоматически подставляет curve refs и leg settings."
        )


if __name__ == "__main__":
    main()
