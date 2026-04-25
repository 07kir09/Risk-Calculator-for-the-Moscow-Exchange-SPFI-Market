"""Shared default inputs used by CLI and API."""
from __future__ import annotations

from .data.models import MarketScenario


def default_scenarios() -> list[MarketScenario]:
    """Default scenario catalog for scenario-based risk metrics.

    The app's primary sample/live portfolios contain rates and FX instruments, so
    the default catalog must shock yield curves and FX spots as well as generic
    underlying/volatility fields. A pure underlying grid leaves IRS/OIS/XCCY
    portfolios with zero scenario P&L and is not a useful API default.
    """
    return [
        MarketScenario(
            scenario_id="base",
            underlying_shift=0.0,
            volatility_shift=0.0,
            rate_shift=0.0,
            fx_spot_shifts={"USD": 0.0, "EUR": 0.0, "CNY": 0.0},
        ),
        MarketScenario(
            scenario_id="rates_parallel_up",
            underlying_shift=-0.02,
            volatility_shift=0.02,
            rate_shift=0.01,
            fx_spot_shifts={"USD": 0.0, "EUR": 0.0, "CNY": 0.0},
        ),
        MarketScenario(
            scenario_id="rates_parallel_down",
            underlying_shift=0.02,
            volatility_shift=-0.01,
            rate_shift=-0.01,
            fx_spot_shifts={"USD": 0.0, "EUR": 0.0, "CNY": 0.0},
        ),
        MarketScenario(
            scenario_id="rub_selloff_fx_up",
            underlying_shift=-0.04,
            volatility_shift=0.06,
            rate_shift=0.0025,
            fx_spot_shifts={"USD": 0.08, "EUR": 0.08, "CNY": 0.06},
        ),
        MarketScenario(
            scenario_id="rub_rally_fx_down",
            underlying_shift=0.03,
            volatility_shift=-0.03,
            rate_shift=-0.0025,
            fx_spot_shifts={"USD": -0.05, "EUR": -0.05, "CNY": -0.04},
        ),
        MarketScenario(
            scenario_id="combined_risk_off",
            underlying_shift=-0.08,
            volatility_shift=0.12,
            rate_shift=0.015,
            fx_spot_shifts={"USD": 0.12, "EUR": 0.12, "CNY": 0.09},
        ),
        MarketScenario(
            scenario_id="mild_risk_off",
            underlying_shift=-0.03,
            volatility_shift=0.05,
            rate_shift=0.005,
            fx_spot_shifts={"USD": 0.04, "EUR": 0.04, "CNY": 0.03},
        ),
    ]


__all__ = ["default_scenarios"]
