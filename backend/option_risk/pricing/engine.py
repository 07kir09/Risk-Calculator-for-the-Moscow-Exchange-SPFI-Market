"""Единая точка выбора модели ценообразования."""
from __future__ import annotations

from ..data.models import OptionPosition, OptionStyle, InstrumentType
from . import binomial, black_scholes, monte_carlo
from .forward import price_forward
from .market import MarketDataContext
from .swap_ir import price_swap_ir


def price_position(
    position: OptionPosition,
    model: str | None = None,
    market: MarketDataContext | None = None,
) -> float:
    """Цена инструмента в зависимости от типа/стиля и выбранной модели."""
    if position.instrument_type == InstrumentType.FORWARD:
        return price_forward(position, market=market)
    if position.instrument_type == InstrumentType.SWAP_IR:
        return price_swap_ir(position, market=market)

    selected = model or position.model
    if position.style == OptionStyle.EUROPEAN:
        if selected == "binomial":
            return binomial.price(position)
        if selected == "mc":
            return monte_carlo.price(position)
        return black_scholes.price_or_intrinsic(position)
    # Американский опцион рассчитываем биномиально
    return binomial.price(position)


__all__ = ["price_position"]
