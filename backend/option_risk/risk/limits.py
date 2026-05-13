"""Проверка лимитов по метрикам."""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple


def check_limits(metrics: Dict[str, Optional[float]], limits: Dict[str, float]) -> List[Tuple[str, float, float, bool]]:
    """
    Возвращает список кортежей (метрика, значение, лимит, превышение).
    Семантика:
      - для риск-мер (VaR/ES/LC VaR, обычно неотрицательные): превышение, если значение > лимита;
      - для PnL (может быть отрицательным): превышение, если PnL < -лимита.
    """
    results = []
    for key, limit_value in limits.items():
        if isinstance(limit_value, dict):
            continue
        value = metrics.get(key)
        if value is None:
            continue
        limit_abs = abs(limit_value)
        breached = value > limit_abs if value >= 0 else value < -limit_abs
        results.append((key, value, limit_value, breached))
    return results


__all__ = ["check_limits"]
