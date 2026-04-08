"""Оценка форварда: curve-based repricing с fallback на упрощенную формулу."""
from __future__ import annotations

import math

from ..data.models import OptionPosition
from .market import MarketDataContext


def _parse_currency_pair(symbol: str) -> tuple[str, str] | None:
    clean = symbol.replace(" ", "").upper()
    if "/" in clean:
        parts = clean.split("/")
        if len(parts) == 2 and all(len(part) == 3 and part.isalpha() for part in parts):
            return parts[0], parts[1]
    if len(clean) == 6 and clean.isalpha():
        return clean[:3], clean[3:]
    return None


def price_forward(position: OptionPosition, market: MarketDataContext | None = None) -> float:
    t = position.time_to_maturity()
    if market is not None:
        pair = _parse_currency_pair(position.underlying_symbol)
        if pair is not None:
            base_ccy, quote_ccy = pair
            foreign_curve = market.get_discount_curve(
                position.receive_discount_curve_ref or position.projection_curve_ref,
                currency=base_ccy,
                collateral_currency=position.collateral_currency,
            )
            domestic_curve = market.get_discount_curve(
                position.pay_discount_curve_ref or position.discount_curve_ref,
                currency=quote_ccy,
                collateral_currency=position.collateral_currency,
            )
            if domestic_curve is not None:
                spot = position.spot_fx if position.spot_fx is not None else position.underlying_price
                forward_price = market.fx_forward_rate(
                    base_ccy,
                    quote_ccy,
                    t,
                    spot=spot,
                    base_curve=foreign_curve,
                    quote_curve=domestic_curve,
                )
                if forward_price is not None:
                    pv_quote = position.notional * domestic_curve.discount_factor(t) * (forward_price - position.strike)
                    if position.currency != quote_ccy:
                        pv_quote *= market.fx_rate(quote_ccy, position.currency)
                    return pv_quote

            if foreign_curve is not None and domestic_curve is not None:
                pv_quote = position.notional * (
                    spot * foreign_curve.discount_factor(t) - position.strike * domestic_curve.discount_factor(t)
                )
                if position.currency != quote_ccy:
                    pv_quote *= market.fx_rate(quote_ccy, position.currency)
                return pv_quote

        forward_curve = market.get_forward_curve(position.projection_curve_ref, currency=position.currency)
        discount_curve = market.get_discount_curve(
            position.discount_curve_ref,
            currency=position.currency,
            collateral_currency=position.collateral_currency,
        )
        if forward_curve is not None and discount_curve is not None:
            forward_price = forward_curve.rate(t)
            return position.notional * discount_curve.discount_factor(t) * (forward_price - position.strike)

    pv = (position.underlying_price - position.strike) * position.notional
    return pv * math.exp(-position.risk_free_rate * t)


__all__ = ["price_forward"]
