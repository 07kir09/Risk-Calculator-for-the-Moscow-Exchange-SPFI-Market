"""Market-data completeness checks for production-style portfolio valuation."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .models import InstrumentType, OptionPosition, Portfolio
from .validation import ValidationMessage
from ..pricing.forward import _parse_currency_pair
from ..pricing.market import MarketDataContext


@dataclass(frozen=True)
class RequiredMarketDatum:
    kind: str
    currency: str
    ref: str | None

    @property
    def label(self) -> str:
        return f"{self.currency} {self.kind}"


@dataclass
class MarketDataCompletenessResult:
    status: str = "complete"
    missing_curves: list[str] = field(default_factory=list)
    affected_positions: list[str] = field(default_factory=list)
    required_market_data: dict[str, list[str]] = field(default_factory=dict)
    warnings: list[ValidationMessage] = field(default_factory=list)

    @property
    def is_complete(self) -> bool:
        return self.status == "complete"

    def to_data_quality(self) -> dict[str, Any]:
        return {
            "market_data_completeness": self.status,
            "missing_curves": self.missing_curves,
            "missing_fx": [],
            "affected_positions": self.affected_positions,
            "partial_positions_count": len(self.affected_positions),
            "warnings": [message.message for message in self.warnings],
        }


def _curve_currency(ref: str | None, fallback: str | None) -> str:
    if ref:
        match = re.match(r"^([A-Z]{3})-", ref.strip().upper())
        if match:
            return match.group(1)
    return (fallback or "").strip().upper()


def _append_discount(items: list[RequiredMarketDatum], *, ref: str | None, currency: str | None) -> None:
    items.append(RequiredMarketDatum(kind="discount", currency=_curve_currency(ref, currency), ref=ref))


def _append_forward(items: list[RequiredMarketDatum], *, ref: str | None, currency: str | None) -> None:
    items.append(RequiredMarketDatum(kind="forward", currency=_curve_currency(ref, currency), ref=ref))


def required_market_data_for_position(position: OptionPosition) -> list[RequiredMarketDatum]:
    """Return curves that must exist to avoid fallback valuation for a position."""
    required: list[RequiredMarketDatum] = []
    if position.instrument_type == InstrumentType.FORWARD:
        pair = _parse_currency_pair(position.underlying_symbol)
        if pair is not None:
            base_ccy, quote_ccy = pair
            _append_discount(required, ref=position.receive_discount_curve_ref or position.projection_curve_ref, currency=base_ccy)
            _append_discount(required, ref=position.pay_discount_curve_ref or position.discount_curve_ref, currency=quote_ccy)
        elif position.discount_curve_ref or position.projection_curve_ref:
            _append_discount(required, ref=position.discount_curve_ref, currency=position.currency)
            _append_forward(required, ref=position.projection_curve_ref, currency=position.currency)
        return required

    if position.instrument_type == InstrumentType.SWAP_IR:
        pay_currency = (position.pay_currency or "").strip().upper()
        receive_currency = (position.receive_currency or "").strip().upper()
        is_cross_currency = bool(pay_currency and receive_currency and pay_currency != receive_currency)
        if is_cross_currency:
            _append_discount(required, ref=position.pay_discount_curve_ref, currency=pay_currency)
            _append_discount(required, ref=position.receive_discount_curve_ref, currency=receive_currency)
            if position.pay_fixed_rate is None:
                _append_forward(required, ref=position.pay_projection_curve_ref, currency=pay_currency)
            if position.receive_fixed_rate is None:
                _append_forward(required, ref=position.receive_projection_curve_ref, currency=receive_currency)
        else:
            currency = position.currency
            _append_discount(
                required,
                ref=position.discount_curve_ref or position.receive_discount_curve_ref or position.pay_discount_curve_ref,
                currency=currency,
            )
            _append_forward(
                required,
                ref=position.projection_curve_ref or position.receive_projection_curve_ref or position.pay_projection_curve_ref,
                currency=currency,
            )
    return required


def _is_available(market: MarketDataContext, item: RequiredMarketDatum, position: OptionPosition) -> bool:
    if item.kind == "discount":
        return market.get_discount_curve(
            item.ref,
            currency=item.currency,
            collateral_currency=position.collateral_currency,
        ) is not None
    if item.kind == "forward":
        return market.get_forward_curve(item.ref, currency=item.currency) is not None
    return True


def assess_market_data_completeness(
    portfolio: Portfolio,
    market: MarketDataContext | None,
    *,
    upstream_warnings: list[ValidationMessage] | None = None,
) -> MarketDataCompletenessResult:
    if market is None:
        return MarketDataCompletenessResult(warnings=list(upstream_warnings or []))

    missing_by_position: dict[str, list[str]] = {}
    missing_labels: set[str] = set()
    for position in portfolio.positions:
        position_missing: list[str] = []
        for item in required_market_data_for_position(position):
            if not item.currency:
                continue
            if _is_available(market, item, position):
                continue
            label = item.label
            missing_labels.add(label)
            position_missing.append(f"{label}: {item.ref or 'inferred'}")
        if position_missing:
            missing_by_position[str(position.position_id)] = sorted(set(position_missing))

    if not missing_by_position:
        return MarketDataCompletenessResult(warnings=list(upstream_warnings or []))

    affected_positions = sorted(missing_by_position)
    return MarketDataCompletenessResult(
        status="incomplete",
        missing_curves=sorted(missing_labels),
        affected_positions=affected_positions,
        required_market_data=missing_by_position,
        warnings=list(upstream_warnings or []),
    )


__all__ = [
    "MarketDataCompletenessResult",
    "assess_market_data_completeness",
    "required_market_data_for_position",
]
