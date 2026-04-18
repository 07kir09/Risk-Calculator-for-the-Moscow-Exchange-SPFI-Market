"""Shared default inputs used by CLI and API."""
from __future__ import annotations

from .data.models import MarketScenario


def default_scenarios() -> list[MarketScenario]:
    """Default symmetric shock grid for scenario-based risk metrics."""
    shocks = [-0.1, -0.05, -0.02, 0.0, 0.02, 0.05, 0.1]
    return [
        MarketScenario(
            scenario_id=f"shock_{idx}",
            underlying_shift=shock,
            volatility_shift=shock * 0.5,
            rate_shift=0.0,
        )
        for idx, shock in enumerate(shocks)
    ]


__all__ = ["default_scenarios"]
