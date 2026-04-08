"""Curve construction/calibration layer from calibrationInstrument market quotes."""
from __future__ import annotations

import datetime as dt
import math
import re
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional

import numpy as np
import pandas as pd

from ..pricing.market import (
    BasisCurve,
    DiscountCurve,
    FXForwardCurve,
    ForwardCurve,
    MarketDataContext,
    build_market_data_context_from_bundle,
)
from .market_data import MarketDataBundle
from .validation import ValidationMessage


@dataclass(frozen=True)
class _OISCurveSpec:
    key: str
    currency: str
    forward_curve_name: str
    matcher: Callable[[str], bool]


@dataclass(frozen=True)
class _ProjectionCurveSpec:
    key: str
    currency: str
    forward_curve_name: str
    matcher: Callable[[str], bool]
    float_frequency_months: int


@dataclass
class CurveCalibrationResult:
    market_context: MarketDataContext
    validation_log: List[ValidationMessage] = field(default_factory=list)
    curve_sources: Dict[str, str] = field(default_factory=dict)


_OIS_SPECS: tuple[_OISCurveSpec, ...] = (
    _OISCurveSpec(
        key="RUB_RUONIA",
        currency="RUB",
        forward_curve_name="RUB-RUONIA-OIS-COMPOUND",
        matcher=lambda name: "RUONIA" in name.upper(),
    ),
    _OISCurveSpec(
        key="RUB_RUSFAR_ON",
        currency="RUB",
        forward_curve_name="RUB-RUSFAR-OIS-COMPOUND",
        matcher=lambda name: "RUSFAR" in name.upper() and "O/N" in name.upper() and "CNY" not in name.upper(),
    ),
    _OISCurveSpec(
        key="CNY_RUSFARCNY_OIS",
        currency="CNY",
        forward_curve_name="CNY-RUSFARCNY-OIS-COMPOUND",
        matcher=lambda name: "RUSFARCNY" in name.upper(),
    ),
    _OISCurveSpec(
        key="EUR_ESTR",
        currency="EUR",
        forward_curve_name="EUR-ESTR",
        matcher=lambda name: "ESTR" in name.upper(),
    ),
    _OISCurveSpec(
        key="USD_SOFR",
        currency="USD",
        forward_curve_name="USD-SOFR",
        matcher=lambda name: "SOFR" in name.upper(),
    ),
)

_PROJECTION_SPECS: tuple[_ProjectionCurveSpec, ...] = (
    _ProjectionCurveSpec(
        key="RUB_KEYRATE",
        currency="RUB",
        forward_curve_name="RUB-CBR-KEY-RATE",
        matcher=lambda name: "KEYRATE" in name.upper() or "KEY RATE" in name.upper(),
        float_frequency_months=3,
    ),
    _ProjectionCurveSpec(
        key="RUB_RUSFAR_3M",
        currency="RUB",
        forward_curve_name="RUB-RUSFAR-3M",
        matcher=lambda name: "RUSFAR RUB 3M" in name.upper(),
        float_frequency_months=3,
    ),
    _ProjectionCurveSpec(
        key="EUR_EURIBOR_3M",
        currency="EUR",
        forward_curve_name="EUR-EURIBOR-Act/365-3M",
        matcher=lambda name: "EURIBOR EUR 3M" in name.upper(),
        float_frequency_months=3,
    ),
    _ProjectionCurveSpec(
        key="CNY_REPO",
        currency="CNY",
        forward_curve_name="CNY-REPO-RATE",
        matcher=lambda name: "FR007" in name.upper() or ("REPO" in name.upper() and "CNY" in name.upper()),
        float_frequency_months=3,
    ),
)

_DISCOUNT_DRIVER_PRIORITY: Dict[str, tuple[str, ...]] = {
    "RUB": ("RUB_RUONIA", "RUB_RUSFAR_ON"),
    "EUR": ("EUR_ESTR",),
    "USD": ("USD_SOFR",),
    "CNY": ("CNY_RUSFARCNY_OIS",),
}
_KNOWN_CURRENCIES = ("RUB", "USD", "EUR", "CNY")


def _tenor_label_to_years(label: str | None) -> Optional[float]:
    text = str(label or "").strip().upper()
    if not text:
        return None
    match = re.search(r"(\d+)\s*([DWMY])\b", text)
    if not match:
        return None
    value = float(match.group(1))
    unit = match.group(2)
    if unit == "D":
        return value / 365.0
    if unit == "W":
        return value / 52.0
    if unit == "M":
        return value / 12.0
    return value


def _latest_fixings_by_key(fixings: pd.DataFrame) -> Dict[str, float]:
    if fixings.empty or "index_name" not in fixings.columns:
        return {}
    latest_fixings: Dict[str, float] = {}
    grouped = fixings.dropna(subset=["index_name", "fixing", "as_of_date"]).groupby("index_name")
    for index_name, group in grouped:
        latest = group.sort_values("as_of_date").iloc[-1]
        upper = str(index_name).upper()
        key = None
        if upper == "RUB KEYRATE":
            key = "RUB_KEYRATE"
        elif "RUONIA" in upper:
            key = "RUB_RUONIA"
        elif "RUSFAR RUB 3M" in upper:
            key = "RUB_RUSFAR_3M"
        elif "RUSFAR" in upper and "CNY" not in upper:
            key = "RUB_RUSFAR_ON"
        elif "RUSFARCNY" in upper:
            key = "CNY_RUSFARCNY_OIS"
        elif "ESTR" in upper:
            key = "EUR_ESTR"
        elif "EURIBOR" in upper and "3M" in upper:
            key = "EUR_EURIBOR_3M"
        elif "SOFR" in upper:
            key = "USD_SOFR"
        if key:
            latest_fixings[key] = float(latest["fixing"])
    return latest_fixings


def _latest_calibration_slice(calibration_instruments: pd.DataFrame) -> pd.DataFrame:
    if calibration_instruments.empty or "as_of_date" not in calibration_instruments.columns:
        return calibration_instruments.iloc[0:0].copy()
    clean = calibration_instruments.dropna(subset=["as_of_date"]).copy()
    if clean.empty:
        return clean
    latest_date = clean["as_of_date"].max()
    latest = clean[clean["as_of_date"] == latest_date].copy()
    latest["tenor_years"] = latest["tenor_label"].map(_tenor_label_to_years)
    latest = latest.dropna(subset=["quote", "tenor_years"])
    return latest.sort_values(["product", "tenor_years", "instrument_name"]).reset_index(drop=True)


def _choose_discount_curve_name(anchor_context: MarketDataContext, currency: str) -> str:
    code = currency.upper()
    preferred = f"{code}-DISCOUNT-{code}-CSA"
    if preferred in anchor_context.discount_curves:
        return preferred
    for curve_name in anchor_context.discount_curves.keys():
        if curve_name.upper().startswith(f"{code}-DISCOUNT-"):
            return curve_name
    return preferred


def _quote_nodes(rows: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    grouped = rows.groupby("tenor_years", as_index=False)["quote"].mean().sort_values("tenor_years")
    tenors = grouped["tenor_years"].to_numpy(dtype=np.float64)
    quotes = grouped["quote"].to_numpy(dtype=np.float64)
    mask = np.isfinite(tenors) & np.isfinite(quotes) & (tenors > 0.0)
    return tenors[mask], quotes[mask]


def _infer_currency_from_leg(text: str | None) -> Optional[str]:
    upper = str(text or "").upper()
    direct = re.search(r"\b(RUB|USD|EUR|CNY)\b", upper)
    if direct:
        return direct.group(1)
    if "RUONIA" in upper or "KEY RATE" in upper or "KEYRATE" in upper:
        return "RUB"
    if "RUSFARCNY" in upper or "FR007" in upper or ("REPO" in upper and "CNY" in upper):
        return "CNY"
    if "RUSFAR" in upper and "CNY" not in upper:
        return "RUB"
    if "EURIBOR" in upper or "ESTR" in upper:
        return "EUR"
    if "SOFR" in upper or "LIBOR USD" in upper:
        return "USD"
    return None


def _parse_currency_pair(text: str | None) -> Optional[tuple[str, str]]:
    upper = str(text or "").upper()
    direct = re.search(r"\b(RUB|USD|EUR|CNY)\s*/\s*(RUB|USD|EUR|CNY)\b", upper)
    if direct and direct.group(1) != direct.group(2):
        return direct.group(1), direct.group(2)

    compact = re.search(r"\b(RUB|USD|EUR|CNY)(RUB|USD|EUR|CNY)\b", upper)
    if compact and compact.group(1) != compact.group(2):
        return compact.group(1), compact.group(2)

    if "/" in upper:
        parts = upper.split("/")
        for idx in range(len(parts) - 1):
            base = _infer_currency_from_leg(parts[idx])
            quote = _infer_currency_from_leg(parts[idx + 1])
            if base and quote and base != quote:
                return base, quote
    return None


def _aggregate_nodes(
    nodes_by_tenor: Dict[float, List[float]],
    *,
    positive_only: bool,
) -> tuple[np.ndarray, np.ndarray]:
    tenors: List[float] = []
    values: List[float] = []
    for tenor in sorted(nodes_by_tenor.keys()):
        clean = [
            float(value)
            for value in nodes_by_tenor[tenor]
            if math.isfinite(float(value)) and (float(value) > 0.0 if positive_only else True)
        ]
        if tenor <= 0.0 or not clean:
            continue
        tenors.append(float(tenor))
        values.append(float(np.mean(clean)))
    return np.asarray(tenors, dtype=np.float64), np.asarray(values, dtype=np.float64)


def _bootstrap_discount_curve_from_ois_quotes(
    *,
    curve_name: str,
    as_of_date: dt.date | None,
    tenors: np.ndarray,
    par_rates: np.ndarray,
) -> Optional[DiscountCurve]:
    if tenors.size == 0:
        return None
    discount_factors = np.zeros_like(tenors, dtype=np.float64)
    for idx, (tenor, par_rate) in enumerate(zip(tenors, par_rates)):
        previous_times = np.concatenate(([0.0], tenors[:idx], [tenor]))
        accruals = np.diff(previous_times)
        known_annuity = 0.0
        if idx > 0:
            known_annuity = float(np.sum(accruals[:-1] * discount_factors[:idx]))
        last_accrual = float(accruals[-1])
        df = (1.0 - float(par_rate) * known_annuity) / (1.0 + float(par_rate) * last_accrual)
        if not math.isfinite(df) or df <= 0.0:
            df = math.exp(-float(par_rate) * float(tenor))
        if idx > 0 and df > discount_factors[idx - 1]:
            df = min(discount_factors[idx - 1], math.exp(-float(par_rate) * float(tenor)))
        discount_factors[idx] = max(df, 1e-8)
    return DiscountCurve(
        name=curve_name,
        as_of_date=as_of_date,
        tenor_years=tenors,
        discount_factors=discount_factors,
    )


def _build_forward_curve_from_discount_curve(
    *,
    curve_name: str,
    discount_curve: DiscountCurve,
    fixing_rate: float | None = None,
) -> ForwardCurve:
    times: List[float] = [0.0]
    rates: List[float] = []
    prev_t = 0.0
    prev_df = 1.0
    for tenor, df in zip(discount_curve.tenor_years, discount_curve.discount_factors):
        accrual = float(max(tenor - prev_t, 1e-8))
        segment_rate = (prev_df / float(df) - 1.0) / accrual
        rates.append(segment_rate)
        times.append(float(tenor))
        prev_t = float(tenor)
        prev_df = float(df)
    first_rate = float(fixing_rate) if fixing_rate is not None else float(rates[0])
    return ForwardCurve(
        name=curve_name,
        as_of_date=discount_curve.as_of_date,
        tenor_years=np.asarray(times, dtype=np.float64),
        forward_rates=np.asarray([first_rate, *rates], dtype=np.float64),
    )


def _fra_nodes(rows: pd.DataFrame) -> Dict[float, float]:
    nodes: Dict[float, float] = {}
    for row in rows.itertuples(index=False):
        match = re.search(r"(\d+\s*[WMY])\s*/\s*(\d+\s*[WMY])", str(row.instrument_name).upper())
        if not match:
            continue
        start_years = _tenor_label_to_years(match.group(1))
        if start_years is None:
            continue
        nodes[float(start_years)] = float(row.quote)
    return dict(sorted(nodes.items()))


def _discount_factor_at(curve: DiscountCurve, tenor_years: float) -> float:
    if tenor_years <= 0.0:
        return 1.0
    return curve.discount_factor(tenor_years)


def _bootstrap_projection_curve(
    *,
    curve_name: str,
    as_of_date: dt.date | None,
    discount_curve: DiscountCurve,
    fixing_rate: float | None,
    fra_rows: pd.DataFrame,
    irs_rows: pd.DataFrame,
    float_frequency_months: int,
) -> Optional[ForwardCurve]:
    node_rates: Dict[float, float] = _fra_nodes(fra_rows)
    if fixing_rate is not None:
        node_rates[0.0] = float(fixing_rate)
    payment_step = float_frequency_months / 12.0
    swap_quotes = irs_rows.groupby("tenor_years", as_index=False)["quote"].mean().sort_values("tenor_years")

    solved_horizon = max((tenor for tenor in node_rates.keys() if tenor > 0.0), default=0.0)
    for row in swap_quotes.itertuples(index=False):
        maturity = float(row.tenor_years)
        if maturity <= 0.0:
            continue
        payment_dates = np.arange(payment_step, maturity + 1e-8, payment_step, dtype=np.float64)
        if payment_dates.size == 0 or payment_dates[-1] < maturity - 1e-8:
            payment_dates = np.append(payment_dates, maturity)
        known_weight = 0.0
        known_pv = 0.0
        new_weight = 0.0
        period_start = 0.0
        for payment_t in payment_dates:
            accrual = float(max(payment_t - period_start, 1e-8))
            df = _discount_factor_at(discount_curve, float(payment_t))
            weight = accrual * df
            if period_start <= solved_horizon + 1e-8:
                previous_nodes = [tenor for tenor in node_rates.keys() if tenor <= period_start + 1e-8]
                if previous_nodes:
                    curve_tenors = np.asarray(sorted(previous_nodes), dtype=np.float64)
                    curve_rates = np.asarray([node_rates[tenor] for tenor in curve_tenors], dtype=np.float64)
                    known_pv += float(np.interp(period_start, curve_tenors, curve_rates)) * weight
                    known_weight += weight
                else:
                    new_weight += weight
            else:
                new_weight += weight
            period_start = float(payment_t)
        annuity = known_weight + new_weight
        if annuity <= 0.0 or new_weight <= 0.0:
            continue
        flat_rate = (float(row.quote) * annuity - known_pv) / new_weight
        if not math.isfinite(flat_rate):
            continue
        node_rates[maturity] = float(flat_rate)
        solved_horizon = max(solved_horizon, maturity)

    if not node_rates:
        return None
    positive_nodes = sorted(tenor for tenor in node_rates.keys() if tenor > 0.0)
    if not positive_nodes:
        return None
    tenor_years = np.asarray([0.0, *positive_nodes], dtype=np.float64)
    forward_rates = np.asarray([node_rates.get(0.0, node_rates[positive_nodes[0]]), *[node_rates[tenor] for tenor in positive_nodes]], dtype=np.float64)
    return ForwardCurve(
        name=curve_name,
        as_of_date=as_of_date,
        tenor_years=tenor_years,
        forward_rates=forward_rates,
    )


def _build_cross_currency_curves(
    *,
    calibration_rows: pd.DataFrame,
    as_of_date: dt.date | None,
    anchor_context: MarketDataContext,
    discount_curves: Dict[str, DiscountCurve],
    latest_fixings: Dict[str, float],
    validation_log: List[ValidationMessage],
    curve_sources: Dict[str, str],
) -> tuple[Dict[str, FXForwardCurve], Dict[str, BasisCurve], Dict[str, ForwardCurve]]:
    fx_forward_nodes: Dict[str, Dict[float, List[float]]] = {}
    fx_forward_spots: Dict[str, float] = {}
    basis_nodes: Dict[str, Dict[float, List[float]]] = {}
    basis_sources: Dict[str, set[str]] = {}
    usd_discount_nodes: Dict[float, List[float]] = {}
    usd_source_pairs: set[str] = set()
    warned_missing_spot: set[str] = set()

    for row in calibration_rows.itertuples(index=False):
        product = str(row.product).upper()
        pair = _parse_currency_pair(str(row.instrument_name))
        tenor_years = float(row.tenor_years)
        quote = float(row.quote)
        if pair is None or tenor_years <= 0.0 or not math.isfinite(quote):
            continue

        pair_name = f"{pair[0]}/{pair[1]}"
        if product == "FX SWAP":
            try:
                spot = anchor_context.fx_rate(pair[0], pair[1])
            except ValueError:
                if pair_name not in warned_missing_spot:
                    validation_log.append(
                        ValidationMessage(
                            severity="WARNING",
                            message=f"calibration: пропущен FX swap {pair_name}, потому что отсутствует FX spot.",
                        )
                    )
                    warned_missing_spot.add(pair_name)
                continue

            forward_price = spot + quote
            if not math.isfinite(forward_price) or forward_price <= 0.0:
                validation_log.append(
                    ValidationMessage(
                        severity="WARNING",
                        message=(
                            f"calibration: пропущен FX swap {pair_name} {row.tenor_label}, "
                            f"потому что spot+points даёт невалидный forward ({forward_price})."
                        ),
                    )
                )
                continue

            fx_forward_spots[pair_name] = float(spot)
            fx_forward_nodes.setdefault(pair_name, {}).setdefault(tenor_years, []).append(float(forward_price))

            if "USD" in pair:
                foreign_currency = pair[1] if pair[0] == "USD" else pair[0]
                foreign_curve_name = _choose_discount_curve_name(anchor_context, foreign_currency)
                foreign_curve = discount_curves.get(foreign_curve_name)
                if foreign_curve is None:
                    continue
                foreign_df = foreign_curve.discount_factor(tenor_years)
                implied_usd_df = (
                    (forward_price / spot) * foreign_df if pair[0] == "USD" else (spot / forward_price) * foreign_df
                )
                if math.isfinite(implied_usd_df) and implied_usd_df > 0.0:
                    usd_discount_nodes.setdefault(tenor_years, []).append(float(implied_usd_df))
                    usd_source_pairs.add(pair_name)
            continue

        if product not in {"BASIS", "XCCY"}:
            continue

        curve_name = f"{pair_name}:BASIS"
        basis_nodes.setdefault(curve_name, {}).setdefault(tenor_years, []).append(quote)
        basis_sources.setdefault(curve_name, set()).add(product)

    fx_forward_curves: Dict[str, FXForwardCurve] = {}
    for pair_name, nodes in fx_forward_nodes.items():
        tenors, forwards = _aggregate_nodes(nodes, positive_only=True)
        if tenors.size == 0:
            continue
        spot = fx_forward_spots[pair_name]
        tenors = np.concatenate([np.asarray([0.0], dtype=np.float64), tenors])
        forwards = np.concatenate([np.asarray([spot], dtype=np.float64), forwards])
        fx_forward_curves[pair_name] = FXForwardCurve(
            name=pair_name,
            as_of_date=as_of_date,
            tenor_years=tenors,
            forward_prices=forwards,
        )
        curve_sources[pair_name] = "calibrated_from_fx_swaps"
        validation_log.append(
            ValidationMessage(
                severity="INFO",
                message=f"calibration: rebuilt FX forward curve {pair_name} from FX Swap quotes ({int(tenors.size - 1)} nodes).",
            )
        )

    basis_curves: Dict[str, BasisCurve] = {}
    for curve_name, nodes in basis_nodes.items():
        tenors, spreads = _aggregate_nodes(nodes, positive_only=False)
        if tenors.size == 0:
            continue
        basis_curves[curve_name] = BasisCurve(
            name=curve_name,
            as_of_date=as_of_date,
            tenor_years=tenors,
            spreads=spreads,
        )
        sources = "/".join(sorted(basis_sources.get(curve_name, {"XCCY"})))
        curve_sources[curve_name] = f"calibrated_from_{sources.lower()}"
        validation_log.append(
            ValidationMessage(
                severity="INFO",
                message=f"calibration: rebuilt basis curve {curve_name} from {sources} quotes ({int(tenors.size)} nodes).",
            )
        )

    derived_forward_curves: Dict[str, ForwardCurve] = {}
    usd_tenors, usd_discount_factors = _aggregate_nodes(usd_discount_nodes, positive_only=True)
    if usd_tenors.size > 0:
        monotone_discount_factors: List[float] = []
        running_df = math.inf
        for discount_factor in usd_discount_factors:
            running_df = min(running_df, float(discount_factor))
            monotone_discount_factors.append(max(running_df, 1e-8))
        implied_usd_curve = DiscountCurve(
            name="USD-OISFX-IMPLIED-DISCOUNT",
            as_of_date=as_of_date,
            tenor_years=usd_tenors,
            discount_factors=np.asarray(monotone_discount_factors, dtype=np.float64),
        )
        derived_forward_curves["USD-OISFX"] = _build_forward_curve_from_discount_curve(
            curve_name="USD-OISFX",
            discount_curve=implied_usd_curve,
            fixing_rate=latest_fixings.get("USD_SOFR"),
        )
        curve_sources["USD-OISFX"] = "calibrated_from_fx_swaps"
        validation_log.append(
            ValidationMessage(
                severity="INFO",
                message=(
                    "calibration: rebuilt USD-OISFX from FX Swap parity using "
                    + ", ".join(sorted(usd_source_pairs))
                    + f" ({int(usd_tenors.size)} nodes)."
                ),
            )
        )

    return fx_forward_curves, basis_curves, derived_forward_curves


def calibrate_market_context_from_bundle(
    bundle: MarketDataBundle,
    *,
    base_currency: str = "RUB",
    anchor_context: MarketDataContext | None = None,
) -> CurveCalibrationResult:
    anchor_context = anchor_context or build_market_data_context_from_bundle(bundle, base_currency=base_currency)
    calibration_rows = _latest_calibration_slice(bundle.calibration_instruments)
    if calibration_rows.empty:
        return CurveCalibrationResult(
            market_context=anchor_context,
            validation_log=[
                ValidationMessage(
                    severity="INFO",
                    message="calibration: калибровочные инструменты отсутствуют, используются curveForward/curveDiscount как anchor curves.",
                )
            ],
            curve_sources={name: "anchor_bundle" for name in [*anchor_context.discount_curves.keys(), *anchor_context.forward_curves.keys()]},
        )

    latest_fixings = _latest_fixings_by_key(bundle.fixings)
    discount_curves = dict(anchor_context.discount_curves)
    forward_curves = dict(anchor_context.forward_curves)
    fx_forward_curves = dict(anchor_context.fx_forward_curves)
    basis_curves = dict(anchor_context.basis_curves)
    curve_sources: Dict[str, str] = {}
    validation_log: List[ValidationMessage] = []
    latest_as_of = calibration_rows["as_of_date"].max()
    as_of_date = latest_as_of.date() if hasattr(latest_as_of, "date") else None

    discount_curve_candidates: Dict[str, DiscountCurve] = {}
    for spec in _OIS_SPECS:
        rows = calibration_rows[
            (calibration_rows["product"].str.upper() == "OIS")
            & calibration_rows["instrument_name"].map(spec.matcher)
        ]
        tenors, quotes = _quote_nodes(rows)
        if tenors.size < 2:
            continue
        discount_curve = _bootstrap_discount_curve_from_ois_quotes(
            curve_name=_choose_discount_curve_name(anchor_context, spec.currency),
            as_of_date=as_of_date,
            tenors=tenors,
            par_rates=quotes,
        )
        if discount_curve is None:
            continue
        discount_curve_candidates[spec.key] = discount_curve
        forward_curve = _build_forward_curve_from_discount_curve(
            curve_name=spec.forward_curve_name,
            discount_curve=discount_curve,
            fixing_rate=latest_fixings.get(spec.key),
        )
        forward_curves[spec.forward_curve_name] = forward_curve
        curve_sources[spec.forward_curve_name] = "calibrated_from_ois"
        validation_log.append(
            ValidationMessage(
                severity="INFO",
                message=f"calibration: rebuilt {spec.forward_curve_name} from OIS quotes ({int(tenors.size)} nodes).",
            )
        )

    for currency, driver_keys in _DISCOUNT_DRIVER_PRIORITY.items():
        for driver_key in driver_keys:
            discount_curve = discount_curve_candidates.get(driver_key)
            if discount_curve is None:
                continue
            discount_curve_name = _choose_discount_curve_name(anchor_context, currency)
            if discount_curve.name != discount_curve_name:
                discount_curve = DiscountCurve(
                    name=discount_curve_name,
                    as_of_date=discount_curve.as_of_date,
                    tenor_years=discount_curve.tenor_years.copy(),
                    discount_factors=discount_curve.discount_factors.copy(),
                )
            discount_curves[discount_curve_name] = discount_curve
            curve_sources[discount_curve_name] = f"calibrated_from_ois:{driver_key}"
            validation_log.append(
                ValidationMessage(
                    severity="INFO",
                    message=f"calibration: rebuilt {discount_curve_name} from OIS driver {driver_key}.",
                )
            )
            break

    for spec in _PROJECTION_SPECS:
        irs_rows = calibration_rows[
            (calibration_rows["product"].str.upper() == "IRS")
            & calibration_rows["instrument_name"].map(spec.matcher)
        ]
        fra_rows = calibration_rows[
            (calibration_rows["product"].str.upper() == "FRA")
            & calibration_rows["instrument_name"].map(spec.matcher)
        ]
        if irs_rows.empty and fra_rows.empty:
            continue
        discount_curve_name = _choose_discount_curve_name(anchor_context, spec.currency)
        discount_curve = discount_curves.get(discount_curve_name)
        if discount_curve is None:
            validation_log.append(
                ValidationMessage(
                    severity="WARNING",
                    message=f"calibration: отсутствует discount curve {discount_curve_name} для bootstrap {spec.forward_curve_name}.",
                )
            )
            continue
        projection_curve = _bootstrap_projection_curve(
            curve_name=spec.forward_curve_name,
            as_of_date=as_of_date,
            discount_curve=discount_curve,
            fixing_rate=latest_fixings.get(spec.key),
            fra_rows=fra_rows,
            irs_rows=irs_rows,
            float_frequency_months=spec.float_frequency_months,
        )
        if projection_curve is None:
            continue
        forward_curves[spec.forward_curve_name] = projection_curve
        curve_sources[spec.forward_curve_name] = "calibrated_from_irs_fra"
        validation_log.append(
            ValidationMessage(
                severity="INFO",
                message=(
                    f"calibration: rebuilt {spec.forward_curve_name} from "
                    f"{len(irs_rows)} IRS and {len(fra_rows)} FRA quotes."
                ),
            )
        )

    cross_fx_forward_curves, cross_basis_curves, cross_forward_curves = _build_cross_currency_curves(
        calibration_rows=calibration_rows,
        as_of_date=as_of_date,
        anchor_context=anchor_context,
        discount_curves=discount_curves,
        latest_fixings=latest_fixings,
        validation_log=validation_log,
        curve_sources=curve_sources,
    )
    fx_forward_curves.update(cross_fx_forward_curves)
    basis_curves.update(cross_basis_curves)
    forward_curves.update(cross_forward_curves)

    for curve_name in discount_curves.keys():
        curve_sources.setdefault(curve_name, "anchor_bundle")
    for curve_name in forward_curves.keys():
        curve_sources.setdefault(curve_name, "anchor_bundle")
    for curve_name in fx_forward_curves.keys():
        curve_sources.setdefault(curve_name, "anchor_bundle")
    for curve_name in basis_curves.keys():
        curve_sources.setdefault(curve_name, "anchor_bundle")

    return CurveCalibrationResult(
        market_context=MarketDataContext(
            discount_curves=discount_curves,
            forward_curves=forward_curves,
            fx_spots=anchor_context.fx_spots,
            fx_forward_curves=fx_forward_curves,
            basis_curves=basis_curves,
            fixing_series=anchor_context.fixing_series,
            base_currency=anchor_context.base_currency,
        ),
        validation_log=validation_log,
        curve_sources=curve_sources,
    )


__all__ = ["CurveCalibrationResult", "calibrate_market_context_from_bundle"]
