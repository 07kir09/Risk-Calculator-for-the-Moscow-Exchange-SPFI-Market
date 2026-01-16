"""Стресс-сценарии и расчёт stress PnL."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from ..data.models import MarketScenario, Portfolio
from .portfolio import scenario_pnl


@dataclass
class StressResult:
    scenario_id: str
    pnl: float
    limit: Optional[float]
    breached: bool


def run_stress_tests(
    portfolio: Portfolio,
    scenarios: List[MarketScenario],
    limits: Optional[Dict[str, float]] = None,
) -> List[StressResult]:
    results: List[StressResult] = []
    for s in scenarios:
        pnl = scenario_pnl(portfolio, s)
        limit = (limits or {}).get(s.scenario_id)
        breached = limit is not None and pnl < -abs(limit)
        results.append(StressResult(scenario_id=s.scenario_id, pnl=pnl, limit=limit, breached=breached))
    return results

