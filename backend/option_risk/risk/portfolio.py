"""Агрегация портфеля и переоценка по сценариям."""
from __future__ import annotations

import math
from typing import Dict, List

import numpy as np

from ..data.models import MarketScenario, OptionPosition, Portfolio, InstrumentType
from ..greeks import analytic as analytic_greeks
from ..pricing.engine import price_position
from ..pricing.market import MarketDataContext


def position_value(
    position: OptionPosition,
    model: str | None = None,
    market: MarketDataContext | None = None,
) -> float:
    """Стоимость позиции с учетом количества."""
    return price_position(position, model=model, market=market) * position.quantity


def portfolio_value(
    portfolio: Portfolio,
    model: str | None = None,
    market: MarketDataContext | None = None,
) -> float:
    values = [position_value(p, model=model, market=market) for p in portfolio.positions]
    return float(np.sum(values, dtype=np.float64))


def _curve_rho_position(position: OptionPosition, market: MarketDataContext, bump: float = 1e-4) -> float:
    up_market = market.shocked(global_curve_shift=bump)
    down_market = market.shocked(global_curve_shift=-bump)
    return (price_position(position, market=up_market) - price_position(position, market=down_market)) / (2 * bump)


def greeks_summary(
    portfolio: Portfolio,
    market: MarketDataContext | None = None,
) -> Dict[str, float]:
    """Суммарные аналитические греки по портфелю."""
    delta = 0.0
    gamma = 0.0
    vega = 0.0
    theta = 0.0
    rho = 0.0
    for p in portfolio.positions:
        if p.instrument_type == InstrumentType.OPTION:
            delta += analytic_greeks.delta(p) * p.quantity
            gamma += analytic_greeks.gamma(p) * p.quantity
            vega += analytic_greeks.vega(p) * p.quantity
            theta += analytic_greeks.theta(p) * p.quantity
            rho += analytic_greeks.rho(p) * p.quantity
        elif p.instrument_type == InstrumentType.FORWARD:
            if market is not None:
                h = max(0.01, p.underlying_price * 1e-4)
                up = p.copy(update={"underlying_price": p.underlying_price + h})
                down = p.copy(update={"underlying_price": p.underlying_price - h})
                delta += ((price_position(up, market=market) - price_position(down, market=market)) / (2 * h)) * p.quantity
                rho += _curve_rho_position(p, market) * p.quantity
            else:
                t = p.time_to_maturity()
                disc = math.exp(-p.risk_free_rate * t)
                delta += p.notional * disc * p.quantity
                rho += (-(p.underlying_price - p.strike) * p.notional * t * disc) * p.quantity
        elif p.instrument_type == InstrumentType.SWAP_IR and market is not None:
            rho += _curve_rho_position(p, market) * p.quantity
    dv01 = sum(dv01_position(p, market=market) * p.quantity for p in portfolio.positions)
    return {
        "delta": delta,
        "gamma": gamma,
        "vega": vega,
        "theta": theta,
        "rho": rho,
        "dv01": dv01,
    }


def apply_scenario(position: OptionPosition, scenario: MarketScenario) -> OptionPosition:
    """Возвращает позицию с измененными параметрами по сценарию."""
    bumped_price = position.underlying_price * (1 + scenario.underlying_shift)
    raw_bumped_vol = position.volatility * (1 + scenario.volatility_shift)
    # Для опционов волатильность должна оставаться положительной, для прочих инструментов допускаем 0.
    vol_floor = 1e-8 if position.instrument_type == InstrumentType.OPTION else 0.0
    bumped_vol = max(vol_floor, raw_bumped_vol)
    bumped_rate = position.risk_free_rate + scenario.rate_shift
    return position.copy(
        update={
            "underlying_price": bumped_price,
            "volatility": bumped_vol,
            "risk_free_rate": bumped_rate,
        }
    )


def scenario_pnl(
    portfolio: Portfolio,
    scenario: MarketScenario,
    model: str | None = None,
    market: MarketDataContext | None = None,
) -> float:
    """PNL портфеля при применении сценария."""
    stressed_positions: List[OptionPosition] = [apply_scenario(p, scenario) for p in portfolio.positions]
    stressed_portfolio = Portfolio(positions=stressed_positions)
    stressed_market = (
        market.shocked(
            global_curve_shift=scenario.rate_shift,
            curve_shifts=scenario.curve_shifts,
            fx_spot_shifts=scenario.fx_spot_shifts,
        )
        if market is not None
        else None
    )
    return portfolio_value(stressed_portfolio, model=model, market=stressed_market) - portfolio_value(
        portfolio,
        model=model,
        market=market,
    )


def scenario_pnl_distribution(
    portfolio: Portfolio,
    scenarios: List[MarketScenario],
    model: str | None = None,
    market: MarketDataContext | None = None,
) -> List[float]:
    """PNL для списка сценариев."""
    return [scenario_pnl(portfolio, s, model=model, market=market) for s in scenarios]


def dv01_position(
    position: OptionPosition,
    bump: float = 1e-4,
    market: MarketDataContext | None = None,
) -> float:
    """DV01 как чувствительность к ставке на 1 bp."""
    if market is not None:
        up_market = market.shocked(global_curve_shift=bump)
        down_market = market.shocked(global_curve_shift=-bump)
        return (price_position(position, market=up_market) - price_position(position, market=down_market)) / (2 * bump)
    up = position.copy(update={"risk_free_rate": position.risk_free_rate + bump})
    down = position.copy(update={"risk_free_rate": position.risk_free_rate - bump})
    return (price_position(up) - price_position(down)) / (2 * bump)
