"""Bootstrap и auto-selection layer для market data и trade-import."""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from .calibration import calibrate_market_context_from_bundle
from ..pricing.market import ForwardCurve, MarketDataContext, build_market_data_context_from_bundle
from .market_data import MarketDataBundle
from .models import InstrumentType, OptionPosition
from .validation import ValidationMessage


_CANONICAL_FIXING_KEYS: Dict[str, tuple[str, ...]] = {
    "RUB_KEYRATE": ("RUB KEYRATE", "KEY RATE", "KEYRATE"),
    "RUB_RUONIA": ("RUONIA",),
    "RUB_RUSFAR_ON": ("RUSFAR RUB O/N", "RUSFAR O/N", "RUSFAR ON", "RUSFAR RUB ON"),
    "RUB_RUSFAR_3M": ("RUSFAR RUB 3M", "RUSFAR 3M"),
    "CNY_RUSFARCNY_OIS": ("RUSFARCNY", "CNY OIS"),
    "CNY_REPO": ("FR007", "CNY REPO", "REPO"),
    "EUR_ESTR": ("ESTR",),
    "EUR_EURIBOR_1M": ("EURIBOR 1M", "EURIBOR EUR 1M"),
    "EUR_EURIBOR_3M": ("EURIBOR 3M", "EURIBOR EUR 3M"),
    "EUR_EURIBOR_6M": ("EURIBOR 6M", "EURIBOR EUR 6M"),
    "USD_SOFR": ("SOFR",),
    "USD_OISFX": ("OIS FX", "OISFX"),
}


def _norm(text: str | None) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", str(text or "").upper()).strip()


def _months_between(start_date: dt.date, end_date: dt.date) -> int:
    days = max((end_date - start_date).days, 1)
    return max(1, int(round(days / 30.4375)))


def _infer_tenor_months_from_text(text: str) -> Optional[int]:
    matches = list(re.finditer(r"(\d+)\s*([WMY])\b", text.upper()))
    if not matches:
        return None
    value = int(matches[-1].group(1))
    unit = matches[-1].group(2)
    if unit == "W":
        return max(1, int(round(value / 4)))
    if unit == "M":
        return value
    return value * 12


def _infer_fixing_lag_days(instrument_text: str, start_date: dt.date, valuation_date: dt.date) -> int:
    upper = instrument_text.upper()
    if "TOD" in upper:
        return 0
    if "TOM" in upper:
        return 1
    if "SPOT" in upper:
        return 2
    return max((start_date - valuation_date).days, 0)


def _default_calendar(currency: str | None) -> Optional[str]:
    if not currency:
        return None
    upper = currency.strip().upper()
    if upper == "EUR":
        return "TARGET"
    return upper


def _joint_calendar(*currencies: str | None) -> Optional[str]:
    parts = [part for part in (_default_calendar(currency) for currency in currencies) if part]
    if not parts:
        return None
    return "+".join(sorted(dict.fromkeys(parts)))


def _infer_collateral_currency(
    *,
    instrument_text: str,
    product_text: str,
    currencies: Tuple[str, ...],
) -> Optional[str]:
    text = f"{product_text} {instrument_text}".upper()
    explicit = re.search(r"\b(RUB|USD|EUR|CNY)\s*CSA\b", text)
    if explicit:
        return explicit.group(1)
    if "RUONIA" in text or "KEY RATE" in text or "KEYRATE" in text or ("RUSFAR" in text and "CNY" not in text):
        return "RUB"
    if "SOFR" in text or "LIBOR USD" in text or "OIS FX" in text or "OISFX" in text:
        return "USD"
    if "ESTR" in text or "EURIBOR" in text:
        return "EUR"
    if "RUSFARCNY" in text or "FR007" in text:
        return "CNY"
    codes = [currency.strip().upper() for currency in currencies if currency]
    for preferred in ("USD", "RUB", "EUR", "CNY"):
        if preferred in codes:
            return preferred
    return codes[0] if codes else None


def _infer_reset_convention(curve_ref: str | None, instrument_text: str = "") -> str:
    upper = f"{curve_ref or ''} {instrument_text}".upper()
    if "OISFX" in upper or "OIS FX" in upper:
        return "in_advance"
    if any(token in upper for token in ("OIS", "O/N", "AVG", "COMP")):
        return "in_arrears"
    return "in_advance"


def _infer_rate_fixing_lag_days(curve_ref: str | None, instrument_text: str = "", currency: str | None = None) -> int:
    upper = f"{curve_ref or ''} {instrument_text}".upper()
    if "OISFX" in upper or "OIS FX" in upper:
        return 2
    if any(token in upper for token in ("OIS", "O/N", "AVG", "COMP", "KEY RATE", "KEYRATE")):
        return 0
    if currency and currency.strip().upper() == "RUB" and "RUSFAR-3M" not in upper:
        return 0
    return 2


def _default_business_day_convention(_: str = "") -> str:
    return "modified_following"


def _currency_day_count(currency: str, curve_ref: str | None = None) -> str:
    ref_upper = (curve_ref or "").upper()
    if "ACT/365" in ref_upper or currency.upper() == "RUB":
        return "ACT/365"
    return "ACT/360"


def _periodicity_months_from_curve_ref(curve_ref: str | None, *, default: int = 3) -> int:
    upper = (curve_ref or "").upper()
    if "OISFX" in upper or "OIS FX" in upper:
        return 3
    for months in (12, 6, 3, 1):
        if f"{months}M" in upper:
            return months
    if any(token in upper for token in ("OIS", "O/N", "ON", "AVG", "COMP")):
        return 12
    return default


def _fixed_leg_frequency(total_months: int, float_frequency_months: int, product_text: str) -> int:
    product_upper = product_text.upper()
    if "OIS" in product_upper:
        return 12 if total_months >= 12 else max(1, total_months)
    if total_months >= 12:
        return 6
    return float_frequency_months


def _curve_fixing_key_from_name(curve_name: str) -> Optional[str]:
    upper = curve_name.upper()
    if upper == "RUB-CBR-KEY-RATE":
        return "RUB_KEYRATE"
    if upper.startswith("RUB-RUONIA-OIS"):
        return "RUB_RUONIA"
    if upper == "RUB-RUSFAR-3M":
        return "RUB_RUSFAR_3M"
    if upper == "RUB-RUSFAR-OIS-COMPOUND":
        return "RUB_RUSFAR_ON"
    if upper == "CNY-RUSFARCNY-OIS-COMPOUND":
        return "CNY_RUSFARCNY_OIS"
    if upper == "CNY-REPO-RATE":
        return "CNY_REPO"
    if upper == "EUR-ESTR":
        return "EUR_ESTR"
    if upper == "EUR-EURIBOR-ACT/365-1M":
        return "EUR_EURIBOR_1M"
    if upper == "EUR-EURIBOR-ACT/365-3M":
        return "EUR_EURIBOR_3M"
    if upper == "EUR-EURIBOR-ACT/365-6M":
        return "EUR_EURIBOR_6M"
    if upper == "USD-SOFR":
        return "USD_SOFR"
    if upper == "USD-OISFX":
        return "USD_OISFX"
    return None


def _fixing_key_from_name(index_name: str) -> Optional[str]:
    upper = index_name.upper()
    if upper == "RUB KEYRATE":
        return "RUB_KEYRATE"
    if "RUONIA" in upper:
        return "RUB_RUONIA"
    if "RUSFAR RUB 3M" in upper:
        return "RUB_RUSFAR_3M"
    if "RUSFAR" in upper and "CNY" not in upper:
        return "RUB_RUSFAR_ON"
    if "RUSFARCNY" in upper:
        return "CNY_RUSFARCNY_OIS"
    if "ESTR" in upper:
        return "EUR_ESTR"
    if "EURIBOR" in upper and "1M" in upper:
        return "EUR_EURIBOR_1M"
    if "EURIBOR" in upper and "3M" in upper:
        return "EUR_EURIBOR_3M"
    if "EURIBOR" in upper and "6M" in upper:
        return "EUR_EURIBOR_6M"
    if "SOFR" in upper:
        return "USD_SOFR"
    if "OIS FX" in upper or "OISFX" in upper:
        return "USD_OISFX"
    return None


def _prepend_or_replace_zero_tenor(curve: ForwardCurve, fixing_rate: float) -> ForwardCurve:
    tenors = curve.tenor_years.copy()
    rates = curve.forward_rates.copy()
    if tenors.size > 0 and abs(float(tenors[0])) < 1e-12:
        rates[0] = float(fixing_rate)
    else:
        tenors = np.concatenate([np.asarray([0.0], dtype=np.float64), tenors])
        rates = np.concatenate([np.asarray([float(fixing_rate)], dtype=np.float64), rates])
    return ForwardCurve(
        name=curve.name,
        as_of_date=curve.as_of_date,
        tenor_years=tenors,
        forward_rates=rates,
    )


def _position_to_payload(position: OptionPosition) -> Dict[str, object]:
    if hasattr(position, "model_dump"):
        return position.model_dump()  # type: ignore[attr-defined]
    return position.dict()


@dataclass
class BootstrappedMarketData:
    market_context: MarketDataContext
    latest_fixings: Dict[str, float]
    projection_curve_ref_by_key: Dict[str, str]
    fixing_ref_by_key: Dict[str, str]
    discount_curve_ref_by_currency: Dict[str, str]
    discount_curve_ref_by_currency_and_csa: Dict[Tuple[str, str], str]
    validation_log: List[ValidationMessage] = field(default_factory=list)

    def select_discount_curve(self, currency: str | None, collateral_currency: str | None = None) -> Optional[str]:
        if not currency:
            return None
        code = currency.strip().upper()
        if collateral_currency:
            collateral = collateral_currency.strip().upper()
            direct = self.discount_curve_ref_by_currency_and_csa.get((code, collateral))
            if direct:
                return direct
        same_currency = self.discount_curve_ref_by_currency_and_csa.get((code, code))
        if same_currency:
            return same_currency
        return self.discount_curve_ref_by_currency.get(code)

    def select_projection_curve(
        self,
        *,
        instrument_text: str,
        currency: str | None,
        product_text: str = "",
    ) -> Optional[str]:
        for key in self._projection_keys_for_trade(instrument_text=instrument_text, currency=currency, product_text=product_text):
            ref = self.projection_curve_ref_by_key.get(key)
            if ref:
                return ref
        return None

    def select_fixing_index(
        self,
        *,
        instrument_text: str,
        currency: str | None,
        product_text: str = "",
    ) -> Optional[str]:
        for key in self._projection_keys_for_trade(instrument_text=instrument_text, currency=currency, product_text=product_text):
            ref = self.fixing_ref_by_key.get(key)
            if ref:
                return ref
        return None

    def enrich_trade_position(
        self,
        position: OptionPosition,
        *,
        product_text: str,
        instrument_text: str,
        ccy1: str,
        ccy2: str,
        notional_1: float | None,
        notional_2: float | None,
        start_date: dt.date,
    ) -> Tuple[OptionPosition, List[ValidationMessage]]:
        messages: List[ValidationMessage] = []
        total_months = _infer_tenor_months_from_text(instrument_text) or _months_between(start_date, position.effective_end_date())
        trade_currencies = tuple(currency for currency in (ccy1, ccy2, position.currency) if currency)
        collateral_currency = _infer_collateral_currency(
            instrument_text=instrument_text,
            product_text=product_text,
            currencies=trade_currencies,
        )

        updates: Dict[str, object] = {
            "start_date": start_date,
            "settlement_date": position.effective_end_date(),
            "collateral_currency": collateral_currency,
        }

        if position.instrument_type == InstrumentType.FORWARD:
            pair = self._extract_currency_pair(position.underlying_symbol, ccy1, ccy2)
            if pair is not None:
                base_ccy, quote_ccy = pair
                updates["receive_currency"] = base_ccy
                updates["pay_currency"] = quote_ccy
                updates["receive_discount_curve_ref"] = self.select_discount_curve(base_ccy, collateral_currency)
                updates["pay_discount_curve_ref"] = self.select_discount_curve(quote_ccy, collateral_currency)
                if notional_1 is not None:
                    updates["receive_leg_notional"] = abs(float(notional_1))
                if notional_2 is not None:
                    updates["pay_leg_notional"] = abs(float(notional_2))
                if position.spot_fx is None:
                    updates["spot_fx"] = position.underlying_price
                updates["pay_calendar"] = _joint_calendar(base_ccy, quote_ccy)
                updates["receive_calendar"] = _joint_calendar(base_ccy, quote_ccy)
                updates["pay_business_day_convention"] = _default_business_day_convention(product_text)
                updates["receive_business_day_convention"] = _default_business_day_convention(product_text)
                if updates.get("receive_discount_curve_ref") is None or updates.get("pay_discount_curve_ref") is None:
                    messages.append(
                        ValidationMessage(
                            severity="WARNING",
                            message=f"{position.position_id}: не удалось автоматически определить обе discount curves для FX forward.",
                        )
                    )
            else:
                discount_curve_ref = self.select_discount_curve(position.currency, collateral_currency)
                projection_curve_ref = self.select_projection_curve(
                    instrument_text=instrument_text,
                    currency=position.currency,
                    product_text=product_text,
                )
                if discount_curve_ref:
                    updates["discount_curve_ref"] = discount_curve_ref
                if projection_curve_ref:
                    updates["projection_curve_ref"] = projection_curve_ref
                    updates["fixing_days_lag"] = _infer_rate_fixing_lag_days(projection_curve_ref, instrument_text, position.currency)
                    updates["reset_convention"] = _infer_reset_convention(projection_curve_ref, instrument_text)
                updates["business_day_convention"] = _default_business_day_convention(product_text)
                updates["pay_calendar"] = _default_calendar(position.currency)
                updates["receive_calendar"] = _default_calendar(position.currency)

        elif position.instrument_type == InstrumentType.SWAP_IR:
            product_upper = product_text.upper()
            is_cross_currency = any(tag in product_upper for tag in ("XCCY", "BASIS")) and ccy1 and ccy2 and ccy1 != ccy2
            if is_cross_currency:
                pay_ccy = ccy1
                receive_ccy = ccy2
                pay_proj = self.select_projection_curve(instrument_text=instrument_text, currency=pay_ccy, product_text=product_text)
                receive_proj = self.select_projection_curve(
                    instrument_text=instrument_text,
                    currency=receive_ccy,
                    product_text=product_text,
                )
                updates.update(
                    {
                        "pay_currency": pay_ccy,
                        "receive_currency": receive_ccy,
                        "pay_leg_notional": abs(float(notional_1)) if notional_1 is not None else position.notional,
                        "receive_leg_notional": abs(float(notional_2)) if notional_2 is not None else position.notional,
                        "pay_discount_curve_ref": self.select_discount_curve(pay_ccy, collateral_currency),
                        "receive_discount_curve_ref": self.select_discount_curve(receive_ccy, collateral_currency),
                        "pay_projection_curve_ref": pay_proj,
                        "receive_projection_curve_ref": receive_proj,
                        "exchange_principal": True,
                        "pay_calendar": _joint_calendar(pay_ccy, receive_ccy),
                        "receive_calendar": _joint_calendar(pay_ccy, receive_ccy),
                        "pay_fixing_calendar": _default_calendar(pay_ccy),
                        "receive_fixing_calendar": _default_calendar(receive_ccy),
                        "pay_business_day_convention": _default_business_day_convention(product_text),
                        "receive_business_day_convention": _default_business_day_convention(product_text),
                        "pay_day_count_convention": _currency_day_count(pay_ccy, pay_proj),
                        "receive_day_count_convention": _currency_day_count(receive_ccy, receive_proj),
                        "pay_reset_convention": _infer_reset_convention(pay_proj, instrument_text),
                        "receive_reset_convention": _infer_reset_convention(receive_proj, instrument_text),
                        "pay_fixing_days_lag": _infer_rate_fixing_lag_days(pay_proj, instrument_text, pay_ccy),
                        "receive_fixing_days_lag": _infer_rate_fixing_lag_days(receive_proj, instrument_text, receive_ccy),
                        "pay_payment_lag_days": 0,
                        "receive_payment_lag_days": 0,
                    }
                )
                if "BASIS" in product_upper:
                    updates.update(
                        {
                            "fixed_rate": None,
                            "pay_fixed_rate": None,
                            "receive_fixed_rate": None,
                            "pay_spread": float(position.fixed_rate) if position.fixed_rate is not None else position.pay_spread,
                            "receive_spread": position.receive_spread,
                        }
                    )
                float_freq = max(
                    _periodicity_months_from_curve_ref(pay_proj, default=3),
                    _periodicity_months_from_curve_ref(receive_proj, default=3),
                )
                updates["float_leg_frequency_months"] = float_freq
                updates["fixed_leg_frequency_months"] = (
                    float_freq if "BASIS" in product_upper else _fixed_leg_frequency(total_months, float_freq, product_text)
                )
                updates["day_count_convention"] = (
                    _currency_day_count("RUB") if "RUB" in {pay_ccy, receive_ccy} else _currency_day_count(receive_ccy)
                )
                updates["business_day_convention"] = _default_business_day_convention(product_text)
            else:
                projection_curve_ref = self.select_projection_curve(
                    instrument_text=instrument_text,
                    currency=position.currency,
                    product_text=product_text,
                )
                fixing_index_ref = self.select_fixing_index(
                    instrument_text=instrument_text,
                    currency=position.currency,
                    product_text=product_text,
                )
                discount_curve_ref = self.select_discount_curve(position.currency, collateral_currency)
                updates["discount_curve_ref"] = discount_curve_ref
                updates["projection_curve_ref"] = projection_curve_ref
                updates["fixing_index_ref"] = fixing_index_ref
                updates["fixing_days_lag"] = _infer_rate_fixing_lag_days(projection_curve_ref, instrument_text, position.currency)
                updates["reset_convention"] = _infer_reset_convention(projection_curve_ref, instrument_text)
                updates["day_count_convention"] = _currency_day_count(position.currency, projection_curve_ref or discount_curve_ref)
                updates["business_day_convention"] = _default_business_day_convention(product_text)
                updates["pay_calendar"] = _default_calendar(position.currency)
                updates["receive_calendar"] = _default_calendar(position.currency)
                float_freq = _periodicity_months_from_curve_ref(projection_curve_ref, default=3)
                updates["float_leg_frequency_months"] = float_freq
                updates["fixed_leg_frequency_months"] = _fixed_leg_frequency(total_months, float_freq, product_text)

                if not discount_curve_ref or not projection_curve_ref:
                    messages.append(
                        ValidationMessage(severity="WARNING", message=f"{position.position_id}: auto curve selection не нашёл все refs для swap.")
                    )

        payload = _position_to_payload(position)
        payload.update(updates)
        return OptionPosition(**payload), messages

    @staticmethod
    def _extract_currency_pair(symbol: str, ccy1: str, ccy2: str) -> Optional[Tuple[str, str]]:
        upper = symbol.upper().replace(" ", "")
        if "/" in upper:
            left, right = upper.split("/", 1)
            if len(left) == 3 and len(right) == 3:
                return left, right
        if len(upper) == 6 and upper.isalpha():
            return upper[:3], upper[3:]
        if ccy1 and ccy2 and len(ccy1) == 3 and len(ccy2) == 3:
            return ccy1, ccy2
        return None

    def _projection_keys_for_trade(
        self,
        *,
        instrument_text: str,
        currency: str | None,
        product_text: str,
    ) -> List[str]:
        upper = instrument_text.upper()
        currency_upper = (currency or "").upper()
        product_upper = product_text.upper()
        is_cross_currency = "XCCY" in product_upper or "BASIS" in product_upper
        keys: List[str] = []

        if currency_upper == "RUB":
            if "KEYRATE" in upper or "KEY RATE" in upper:
                keys.append("RUB_KEYRATE")
            if "RUONIA" in upper:
                keys.append("RUB_RUONIA")
            if "RUSFAR" in upper and "3M" in upper and "CNY" not in upper:
                keys.append("RUB_RUSFAR_3M")
            if "RUSFAR" in upper and "3M" not in upper and "CNY" not in upper:
                keys.append("RUB_RUSFAR_ON")
        elif currency_upper == "CNY":
            if "RUSFARCNY" in upper:
                keys.append("CNY_RUSFARCNY_OIS")
            if "FR007" in upper or ("REPO" in upper and "CNY" in upper):
                keys.append("CNY_REPO")
        elif currency_upper == "EUR":
            if "ESTR" in upper:
                keys.append("EUR_ESTR")
            if "EURIBOR" in upper and "1M" in upper:
                keys.append("EUR_EURIBOR_1M")
            if "EURIBOR" in upper and "3M" in upper:
                keys.append("EUR_EURIBOR_3M")
            if "EURIBOR" in upper and "6M" in upper:
                keys.append("EUR_EURIBOR_6M")
        elif currency_upper == "USD":
            if "OIS FX" in upper or "OISFX" in upper or ("LIBOR" in upper and "USD" in upper) or is_cross_currency:
                keys.append("USD_OISFX")
            if "SOFR" in upper:
                keys.append("USD_SOFR")
        else:
            if "KEYRATE" in upper or "KEY RATE" in upper:
                keys.append("RUB_KEYRATE")
            if "RUONIA" in upper:
                keys.append("RUB_RUONIA")
            if "RUSFAR" in upper and "3M" in upper and "CNY" not in upper:
                keys.append("RUB_RUSFAR_3M")
            if "RUSFARCNY" in upper:
                keys.append("CNY_RUSFARCNY_OIS")
            if "RUSFAR" in upper and "3M" not in upper and "CNY" not in upper:
                keys.append("RUB_RUSFAR_ON")
            if "FR007" in upper or ("REPO" in upper and "CNY" in upper):
                keys.append("CNY_REPO")
            if "ESTR" in upper:
                keys.append("EUR_ESTR")
            if "EURIBOR" in upper and "1M" in upper:
                keys.append("EUR_EURIBOR_1M")
            if "EURIBOR" in upper and "3M" in upper:
                keys.append("EUR_EURIBOR_3M")
            if "EURIBOR" in upper and "6M" in upper:
                keys.append("EUR_EURIBOR_6M")
            if "OIS FX" in upper or "OISFX" in upper or ("LIBOR" in upper and "USD" in upper) or is_cross_currency:
                keys.append("USD_OISFX")
            if "SOFR" in upper:
                keys.append("USD_SOFR")

        if not keys:
            if currency_upper == "RUB":
                keys.append("RUB_RUONIA" if "OIS" in product_upper or is_cross_currency else "RUB_RUSFAR_3M")
            elif currency_upper == "CNY":
                keys.append("CNY_RUSFARCNY_OIS" if "OIS" in product_upper or is_cross_currency else "CNY_REPO")
            elif currency_upper == "EUR":
                keys.append("EUR_ESTR" if "OIS" in product_upper else "EUR_EURIBOR_3M")
            elif currency_upper == "USD":
                keys.append("USD_OISFX" if is_cross_currency else "USD_SOFR")
        return list(dict.fromkeys(keys))


def build_bootstrapped_market_data(
    bundle: MarketDataBundle,
    *,
    base_currency: str = "RUB",
) -> BootstrappedMarketData:
    base_context = build_market_data_context_from_bundle(bundle, base_currency=base_currency)
    calibration_result = calibrate_market_context_from_bundle(
        bundle,
        base_currency=base_currency,
        anchor_context=base_context,
    )
    calibration_context = calibration_result.market_context
    validation_log: List[ValidationMessage] = list(calibration_result.validation_log)

    latest_fixings: Dict[str, float] = {}
    fixing_ref_by_key: Dict[str, str] = {}
    if not bundle.fixings.empty and "index_name" in bundle.fixings.columns:
        for index_name, group in bundle.fixings.groupby("index_name"):
            latest = group.sort_values("as_of_date").iloc[-1]
            latest_fixings[str(index_name)] = float(latest["fixing"])
            key = _fixing_key_from_name(str(index_name))
            if key and key not in fixing_ref_by_key:
                fixing_ref_by_key[key] = str(index_name)

    projection_curve_ref_by_key: Dict[str, str] = {}
    augmented_forward_curves = dict(calibration_context.forward_curves)
    for curve_name, curve in calibration_context.forward_curves.items():
        key = _curve_fixing_key_from_name(curve_name)
        if key and key not in projection_curve_ref_by_key:
            projection_curve_ref_by_key[key] = curve_name
        if key and key in fixing_ref_by_key:
            fixing_name = fixing_ref_by_key[key]
            augmented_forward_curves[curve_name] = _prepend_or_replace_zero_tenor(curve, latest_fixings[fixing_name])

    discount_curve_ref_by_currency: Dict[str, str] = {}
    discount_curve_ref_by_currency_and_csa: Dict[Tuple[str, str], str] = {}
    for curve_name in calibration_context.discount_curves.keys():
        upper = curve_name.upper()
        match = re.match(r"^([A-Z]{3})-DISCOUNT-([A-Z]{3})-CSA$", upper)
        if match:
            discount_curve_ref_by_currency_and_csa[(match.group(1), match.group(2))] = curve_name
            if match.group(1) == match.group(2):
                discount_curve_ref_by_currency.setdefault(match.group(1), curve_name)
    for curve_name in calibration_context.discount_curves.keys():
        upper = curve_name.upper()
        match = re.match(r"^([A-Z]{3})-DISCOUNT-", upper)
        if match:
            discount_curve_ref_by_currency.setdefault(match.group(1), curve_name)

    market_context = MarketDataContext(
        discount_curves=calibration_context.discount_curves,
        forward_curves=augmented_forward_curves,
        fx_spots=calibration_context.fx_spots,
        fx_forward_curves=calibration_context.fx_forward_curves,
        basis_curves=calibration_context.basis_curves,
        fixing_series=calibration_context.fixing_series,
        base_currency=calibration_context.base_currency,
    )

    for currency in ("RUB", "USD", "EUR", "CNY"):
        if currency not in discount_curve_ref_by_currency:
            validation_log.append(
                ValidationMessage(
                    severity="WARNING",
                    message=f"bootstrap: не найдена discount curve для валюты {currency}.",
                )
            )

    return BootstrappedMarketData(
        market_context=market_context,
        latest_fixings=latest_fixings,
        projection_curve_ref_by_key=projection_curve_ref_by_key,
        fixing_ref_by_key=fixing_ref_by_key,
        discount_curve_ref_by_currency=discount_curve_ref_by_currency,
        discount_curve_ref_by_currency_and_csa=discount_curve_ref_by_currency_and_csa,
        validation_log=validation_log,
    )


__all__ = ["BootstrappedMarketData", "build_bootstrapped_market_data"]
