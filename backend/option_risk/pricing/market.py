"""Runtime market context: curves, FX spots and market shocks."""
from __future__ import annotations

import datetime as dt
import math
import re
from bisect import bisect_right
from dataclasses import dataclass, field
from typing import Dict, Optional

import numpy as np

from ..data.market_data import MarketDataBundle


def _to_date(value) -> dt.date | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    try:
        return dt.date.fromisoformat(str(value))
    except Exception:
        return None


def _normalize_name(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", str(value or "").upper()).strip()


def _positive_fx_spot(label: str, value: float) -> float:
    spot = float(value)
    if not math.isfinite(spot) or spot <= 0.0:
        raise ValueError(f"FX spot for {label} must be a positive finite number")
    return spot


def _canonical_fixing_key(value: str | None, *, for_projection_curve: bool = False) -> str | None:
    upper = _normalize_name(value)
    if not upper:
        return None
    if upper == "USD OISFX" or upper == "USD OIS FX":
        return "USD_SOFR" if for_projection_curve else "USD_OISFX"
    if upper == "RUB CBR KEY RATE" or upper == "RUB KEYRATE" or upper == "KEY RATE" or upper == "KEYRATE":
        return "RUB_KEYRATE"
    if "RUONIA" in upper:
        return "RUB_RUONIA"
    if upper == "RUB RUSFAR 3M" or "RUSFAR RUB 3M" in upper:
        return "RUB_RUSFAR_3M"
    if "RUSFAR" in upper and "3M" not in upper and "CNY" not in upper:
        return "RUB_RUSFAR_ON"
    if "RUSFARCNY" in upper:
        return "CNY_RUSFARCNY_OIS"
    if upper == "CNY REPO RATE" or "FR007" in upper or ("REPO" in upper and "CNY" in upper):
        return "CNY_REPO"
    if upper == "EUR ESTR" or "ESTR" in upper:
        return "EUR_ESTR"
    if "EURIBOR" in upper and "1M" in upper:
        return "EUR_EURIBOR_1M"
    if "EURIBOR" in upper and "3M" in upper:
        return "EUR_EURIBOR_3M"
    if "EURIBOR" in upper and "6M" in upper:
        return "EUR_EURIBOR_6M"
    if upper == "USD SOFR" or "SOFR" in upper:
        return "USD_SOFR"
    if upper == "OIS FX" or upper == "OISFX":
        return "USD_OISFX"
    return None


@dataclass(frozen=True)
class FixingSeries:
    name: str
    dates: tuple[dt.date, ...]
    rates: np.ndarray

    def __post_init__(self) -> None:
        if len(self.dates) == 0:
            raise ValueError(f"FixingSeries {self.name}: series is empty")
        order = np.argsort(np.asarray([value.toordinal() for value in self.dates], dtype=np.int64))
        ordered_dates = tuple(self.dates[idx] for idx in order)
        ordered_rates = np.asarray(self.rates, dtype=np.float64)[order]
        if ordered_rates.ndim != 1 or ordered_rates.size != len(ordered_dates):
            raise ValueError(f"FixingSeries {self.name}: invalid series shape")
        if np.any(~np.isfinite(ordered_rates)):
            raise ValueError(f"FixingSeries {self.name}: contains non-finite rates")
        object.__setattr__(self, "dates", ordered_dates)
        object.__setattr__(self, "rates", ordered_rates)

    def latest_date(self) -> dt.date:
        return self.dates[-1]

    def rate_on_or_before(self, value: dt.date) -> float | None:
        idx = bisect_right(self.dates, value) - 1
        if idx < 0:
            return None
        return float(self.rates[idx])


@dataclass(frozen=True)
class DiscountCurve:
    name: str
    as_of_date: dt.date | None
    tenor_years: np.ndarray
    discount_factors: np.ndarray

    def __post_init__(self) -> None:
        tenors = np.asarray(self.tenor_years, dtype=np.float64)
        dfs = np.asarray(self.discount_factors, dtype=np.float64)
        if tenors.ndim != 1 or dfs.ndim != 1 or tenors.size != dfs.size or tenors.size == 0:
            raise ValueError(f"DiscountCurve {self.name}: invalid curve shape")
        if np.any(~np.isfinite(tenors)) or np.any(~np.isfinite(dfs)):
            raise ValueError(f"DiscountCurve {self.name}: curve contains non-finite values")
        if np.any(tenors <= 0.0):
            raise ValueError(f"DiscountCurve {self.name}: tenors must be positive")
        if np.any(dfs <= 0.0):
            raise ValueError(f"DiscountCurve {self.name}: discount factors must be positive")
        order = np.argsort(tenors)
        object.__setattr__(self, "tenor_years", tenors[order])
        object.__setattr__(self, "discount_factors", dfs[order])

    def zero_rates(self) -> np.ndarray:
        return -np.log(self.discount_factors) / self.tenor_years

    def zero_rate(self, tenor_years: float) -> float:
        if tenor_years <= 0.0:
            return 0.0
        zeros = self.zero_rates()
        return float(np.interp(tenor_years, self.tenor_years, zeros, left=zeros[0], right=zeros[-1]))

    def discount_factor(self, tenor_years: float) -> float:
        if tenor_years <= 0.0:
            return 1.0
        return math.exp(-self.zero_rate(tenor_years) * tenor_years)

    def shifted(self, parallel_shift: float) -> "DiscountCurve":
        if parallel_shift == 0.0:
            return self
        shifted_zeros = self.zero_rates() + float(parallel_shift)
        shifted_dfs = np.exp(-shifted_zeros * self.tenor_years)
        return DiscountCurve(
            name=self.name,
            as_of_date=self.as_of_date,
            tenor_years=self.tenor_years.copy(),
            discount_factors=shifted_dfs,
        )


@dataclass(frozen=True)
class ForwardCurve:
    name: str
    as_of_date: dt.date | None
    tenor_years: np.ndarray
    forward_rates: np.ndarray

    def __post_init__(self) -> None:
        tenors = np.asarray(self.tenor_years, dtype=np.float64)
        rates = np.asarray(self.forward_rates, dtype=np.float64)
        if tenors.ndim != 1 or rates.ndim != 1 or tenors.size != rates.size or tenors.size == 0:
            raise ValueError(f"ForwardCurve {self.name}: invalid curve shape")
        if np.any(~np.isfinite(tenors)) or np.any(~np.isfinite(rates)):
            raise ValueError(f"ForwardCurve {self.name}: curve contains non-finite values")
        if np.any(tenors < 0.0):
            raise ValueError(f"ForwardCurve {self.name}: tenors must be non-negative")
        order = np.argsort(tenors)
        object.__setattr__(self, "tenor_years", tenors[order])
        object.__setattr__(self, "forward_rates", rates[order])

    def rate(self, tenor_years: float) -> float:
        if tenor_years <= 0.0:
            return float(self.forward_rates[0])
        return float(np.interp(tenor_years, self.tenor_years, self.forward_rates, left=self.forward_rates[0], right=self.forward_rates[-1]))

    def shifted(self, parallel_shift: float) -> "ForwardCurve":
        if parallel_shift == 0.0:
            return self
        return ForwardCurve(
            name=self.name,
            as_of_date=self.as_of_date,
            tenor_years=self.tenor_years.copy(),
            forward_rates=self.forward_rates + float(parallel_shift),
        )


@dataclass(frozen=True)
class FXForwardCurve:
    name: str
    as_of_date: dt.date | None
    tenor_years: np.ndarray
    forward_prices: np.ndarray

    def __post_init__(self) -> None:
        tenors = np.asarray(self.tenor_years, dtype=np.float64)
        forwards = np.asarray(self.forward_prices, dtype=np.float64)
        if tenors.ndim != 1 or forwards.ndim != 1 or tenors.size != forwards.size or tenors.size == 0:
            raise ValueError(f"FXForwardCurve {self.name}: invalid curve shape")
        if np.any(~np.isfinite(tenors)) or np.any(~np.isfinite(forwards)):
            raise ValueError(f"FXForwardCurve {self.name}: curve contains non-finite values")
        if np.any(tenors < 0.0):
            raise ValueError(f"FXForwardCurve {self.name}: tenors must be non-negative")
        if np.any(forwards <= 0.0):
            raise ValueError(f"FXForwardCurve {self.name}: forward prices must be positive")
        order = np.argsort(tenors)
        object.__setattr__(self, "tenor_years", tenors[order])
        object.__setattr__(self, "forward_prices", forwards[order])

    def forward_price(self, tenor_years: float) -> float:
        if tenor_years <= 0.0:
            return float(self.forward_prices[0])
        return float(
            np.interp(
                tenor_years,
                self.tenor_years,
                self.forward_prices,
                left=self.forward_prices[0],
                right=self.forward_prices[-1],
            )
        )

    def shifted(self, parallel_shift: float) -> "FXForwardCurve":
        if parallel_shift == 0.0:
            return self
        return FXForwardCurve(
            name=self.name,
            as_of_date=self.as_of_date,
            tenor_years=self.tenor_years.copy(),
            forward_prices=self.forward_prices + float(parallel_shift),
        )


@dataclass(frozen=True)
class BasisCurve:
    name: str
    as_of_date: dt.date | None
    tenor_years: np.ndarray
    spreads: np.ndarray

    def __post_init__(self) -> None:
        tenors = np.asarray(self.tenor_years, dtype=np.float64)
        spreads = np.asarray(self.spreads, dtype=np.float64)
        if tenors.ndim != 1 or spreads.ndim != 1 or tenors.size != spreads.size or tenors.size == 0:
            raise ValueError(f"BasisCurve {self.name}: invalid curve shape")
        if np.any(~np.isfinite(tenors)) or np.any(~np.isfinite(spreads)):
            raise ValueError(f"BasisCurve {self.name}: curve contains non-finite values")
        if np.any(tenors < 0.0):
            raise ValueError(f"BasisCurve {self.name}: tenors must be non-negative")
        order = np.argsort(tenors)
        object.__setattr__(self, "tenor_years", tenors[order])
        object.__setattr__(self, "spreads", spreads[order])

    def spread(self, tenor_years: float) -> float:
        if tenor_years <= 0.0:
            return float(self.spreads[0])
        return float(np.interp(tenor_years, self.tenor_years, self.spreads, left=self.spreads[0], right=self.spreads[-1]))

    def shifted(self, parallel_shift: float) -> "BasisCurve":
        if parallel_shift == 0.0:
            return self
        return BasisCurve(
            name=self.name,
            as_of_date=self.as_of_date,
            tenor_years=self.tenor_years.copy(),
            spreads=self.spreads + float(parallel_shift),
        )


@dataclass(frozen=True)
class MarketDataContext:
    discount_curves: Dict[str, DiscountCurve]
    forward_curves: Dict[str, ForwardCurve]
    fx_spots: Dict[str, float]
    fx_forward_curves: Dict[str, FXForwardCurve] = field(default_factory=dict)
    basis_curves: Dict[str, BasisCurve] = field(default_factory=dict)
    fixing_series: Dict[str, FixingSeries] = field(default_factory=dict)
    base_currency: str = "RUB"

    def get_discount_curve(
        self,
        ref: str | None = None,
        *,
        currency: str | None = None,
        collateral_currency: str | None = None,
    ) -> DiscountCurve | None:
        if ref and ref in self.discount_curves:
            return self.discount_curves[ref]
        return self._infer_discount_curve(currency, collateral_currency=collateral_currency)

    def get_forward_curve(
        self,
        ref: str | None = None,
        *,
        currency: str | None = None,
    ) -> ForwardCurve | None:
        if ref and ref in self.forward_curves:
            return self.forward_curves[ref]
        return self._infer_forward_curve(currency)

    def get_fixing_series(
        self,
        ref: str | None = None,
        *,
        projection_curve_ref: str | None = None,
    ) -> FixingSeries | None:
        if ref and ref in self.fixing_series:
            return self.fixing_series[ref]
        canonical_ref = _canonical_fixing_key(ref)
        if canonical_ref and canonical_ref in self.fixing_series:
            return self.fixing_series[canonical_ref]
        canonical_curve_ref = _canonical_fixing_key(projection_curve_ref, for_projection_curve=True)
        if canonical_curve_ref and canonical_curve_ref in self.fixing_series:
            return self.fixing_series[canonical_curve_ref]
        return None

    def _infer_discount_curve(self, currency: str | None, *, collateral_currency: str | None = None) -> DiscountCurve | None:
        if not currency:
            return None
        code = currency.strip().upper()
        if collateral_currency:
            collateral = collateral_currency.strip().upper()
            preferred = self.discount_curves.get(f"{code}-DISCOUNT-{collateral}-CSA")
            if preferred is not None:
                return preferred
        prefix = f"{code}-DISCOUNT"
        matches = [curve for name, curve in self.discount_curves.items() if name.upper().startswith(prefix)]
        if collateral_currency:
            same_currency = self.discount_curves.get(f"{code}-DISCOUNT-{code}-CSA")
            if same_currency is not None:
                return same_currency
        return matches[0] if len(matches) == 1 else None

    def _infer_forward_curve(self, currency: str | None) -> ForwardCurve | None:
        if not currency:
            return None
        code = currency.strip().upper()
        matches = [curve for name, curve in self.forward_curves.items() if name.upper().startswith(f"{code}-")]
        return matches[0] if len(matches) == 1 else None

    def fx_rate(self, from_currency: str, to_currency: str) -> float:
        src = from_currency.strip().upper()
        dst = to_currency.strip().upper()
        if src == dst:
            return 1.0

        direct = self.fx_spots.get(f"{src}/{dst}")
        if direct is not None:
            return _positive_fx_spot(f"{src}/{dst}", direct)
        inverse = self.fx_spots.get(f"{dst}/{src}")
        if inverse is not None:
            return 1.0 / _positive_fx_spot(f"{dst}/{src}", inverse)

        src_to_base = self.fx_spots.get(src)
        dst_to_base = self.fx_spots.get(dst)
        if src == self.base_currency and dst_to_base is not None:
            return 1.0 / _positive_fx_spot(dst, dst_to_base)
        if dst == self.base_currency and src_to_base is not None:
            return _positive_fx_spot(src, src_to_base)
        if src_to_base is not None and dst_to_base is not None:
            return _positive_fx_spot(src, src_to_base) / _positive_fx_spot(dst, dst_to_base)
        raise ValueError(f"Нет FX spot для конвертации {src}->{dst}")

    def fx_forward_rate(
        self,
        from_currency: str,
        to_currency: str,
        tenor_years: float,
        *,
        spot: float | None = None,
        base_curve: DiscountCurve | None = None,
        quote_curve: DiscountCurve | None = None,
    ) -> float | None:
        src = from_currency.strip().upper()
        dst = to_currency.strip().upper()
        if src == dst:
            return 1.0
        direct_name = f"{src}/{dst}"
        direct_curve = self.fx_forward_curves.get(direct_name)
        if direct_curve is not None:
            return direct_curve.forward_price(tenor_years)
        inverse_name = f"{dst}/{src}"
        inverse_curve = self.fx_forward_curves.get(inverse_name)
        if inverse_curve is not None:
            price = inverse_curve.forward_price(tenor_years)
            return 1.0 / price if price != 0.0 else None

        if spot is None:
            try:
                spot = self.fx_rate(src, dst)
            except ValueError:
                return None
        if base_curve is not None and quote_curve is not None:
            return float(spot) * base_curve.discount_factor(tenor_years) / quote_curve.discount_factor(tenor_years)
        return None

    def basis_spread(
        self,
        pay_currency: str,
        receive_currency: str,
        tenor_years: float,
    ) -> float | None:
        pay = pay_currency.strip().upper()
        receive = receive_currency.strip().upper()
        direct = self.basis_curves.get(f"{pay}/{receive}:BASIS")
        if direct is not None:
            return direct.spread(tenor_years)
        inverse = self.basis_curves.get(f"{receive}/{pay}:BASIS")
        if inverse is not None:
            return -inverse.spread(tenor_years)
        return None

    def shocked(
        self,
        *,
        global_curve_shift: float = 0.0,
        curve_shifts: Optional[Dict[str, float]] = None,
        fx_spot_shifts: Optional[Dict[str, float]] = None,
    ) -> "MarketDataContext":
        curve_shifts = curve_shifts or {}
        fx_spot_shifts = fx_spot_shifts or {}

        discount_curves = {
            name: curve.shifted(global_curve_shift + float(curve_shifts.get(name, 0.0)))
            for name, curve in self.discount_curves.items()
        }
        forward_curves = {
            name: curve.shifted(global_curve_shift + float(curve_shifts.get(name, 0.0)))
            for name, curve in self.forward_curves.items()
        }
        fx_forward_curves = {
            name: curve.shifted(global_curve_shift + float(curve_shifts.get(name, 0.0)))
            for name, curve in self.fx_forward_curves.items()
        }
        basis_curves = {
            name: curve.shifted(global_curve_shift + float(curve_shifts.get(name, 0.0)))
            for name, curve in self.basis_curves.items()
        }

        fx_spots = dict(self.fx_spots)
        for key, shift in fx_spot_shifts.items():
            clean_key = str(key).strip().upper().replace("-", "/")
            multiplier = 1.0 + float(shift)
            if multiplier <= 0.0:
                continue
            for spot_key in list(fx_spots.keys()):
                normalized_spot_key = str(spot_key).strip().upper().replace("-", "/")
                compact_spot_key = normalized_spot_key.replace("/", "")
                if clean_key == normalized_spot_key or clean_key == compact_spot_key:
                    fx_spots[spot_key] = float(fx_spots[spot_key]) * multiplier
                    continue
                if "/" in normalized_spot_key:
                    left, right = normalized_spot_key.split("/", 1)
                    if clean_key == left and right == self.base_currency:
                        fx_spots[spot_key] = float(fx_spots[spot_key]) * multiplier
                    elif clean_key == right and left == self.base_currency:
                        fx_spots[spot_key] = float(fx_spots[spot_key]) / multiplier
                elif clean_key == normalized_spot_key:
                    fx_spots[spot_key] = float(fx_spots[spot_key]) * multiplier

        return MarketDataContext(
            discount_curves=discount_curves,
            forward_curves=forward_curves,
            fx_spots=fx_spots,
            fx_forward_curves=fx_forward_curves,
            basis_curves=basis_curves,
            fixing_series=self.fixing_series,
            base_currency=self.base_currency,
        )


def build_market_data_context_from_bundle(
    bundle: MarketDataBundle,
    *,
    base_currency: str = "RUB",
) -> MarketDataContext:
    discount_curves: Dict[str, DiscountCurve] = {}
    if "curve_name" in bundle.discount_curves.columns:
        for curve_name, group in bundle.discount_curves.groupby("curve_name"):
            clean = group.dropna(subset=["tenor_years", "discount_factor"]).copy()
            clean = clean[clean["discount_factor"] > 0.0]
            if clean.empty:
                continue
            latest_date = clean["as_of_date"].max()
            latest = clean[clean["as_of_date"] == latest_date].sort_values("tenor_years")
            latest = latest.drop_duplicates(subset=["tenor_years"], keep="last")
            discount_curves[str(curve_name)] = DiscountCurve(
                name=str(curve_name),
                as_of_date=_to_date(latest_date),
                tenor_years=latest["tenor_years"].to_numpy(dtype=np.float64),
                discount_factors=latest["discount_factor"].to_numpy(dtype=np.float64),
            )

    forward_curves: Dict[str, ForwardCurve] = {}
    if "curve_name" in bundle.forward_curves.columns:
        for curve_name, group in bundle.forward_curves.groupby("curve_name"):
            clean = group.dropna(subset=["tenor_years", "forward_rate"]).copy()
            if clean.empty:
                continue
            latest_date = clean["as_of_date"].max()
            latest = clean[clean["as_of_date"] == latest_date].sort_values("tenor_years")
            latest = latest.drop_duplicates(subset=["tenor_years"], keep="last")
            forward_curves[str(curve_name)] = ForwardCurve(
                name=str(curve_name),
                as_of_date=_to_date(latest_date),
                tenor_years=latest["tenor_years"].to_numpy(dtype=np.float64),
                forward_rates=latest["forward_rate"].to_numpy(dtype=np.float64),
            )

    fx_spots: Dict[str, float] = {}
    if not bundle.fx_history.empty and "currency_code" in bundle.fx_history.columns:
        grouped = bundle.fx_history.dropna(subset=["currency_code", "obs_date", "rate"]).groupby("currency_code")
        for code, group in grouped:
            latest_row = group.sort_values("obs_date").iloc[-1]
            nominal = float(latest_row["nominal"]) if float(latest_row["nominal"]) != 0.0 else 1.0
            spot = float(latest_row["rate"]) / nominal
            fx_spots[str(code).upper()] = _positive_fx_spot(str(code).upper(), spot)

    fixing_series: Dict[str, FixingSeries] = {}
    if not bundle.fixings.empty and "index_name" in bundle.fixings.columns:
        clean = bundle.fixings.dropna(subset=["index_name", "as_of_date", "fixing"]).copy()
        clean["as_of_date"] = clean["as_of_date"].map(_to_date)
        clean = clean.dropna(subset=["as_of_date"])
        for index_name, group in clean.groupby("index_name"):
            latest = group.sort_values("as_of_date").drop_duplicates(subset=["as_of_date"], keep="last")
            series = FixingSeries(
                name=str(index_name),
                dates=tuple(latest["as_of_date"].tolist()),
                rates=latest["fixing"].to_numpy(dtype=np.float64),
            )
            fixing_series[str(index_name)] = series
            canonical = _canonical_fixing_key(str(index_name))
            if canonical:
                fixing_series[canonical] = series

    return MarketDataContext(
        discount_curves=discount_curves,
        forward_curves=forward_curves,
        fx_spots=fx_spots,
        fx_forward_curves={},
        basis_curves={},
        fixing_series=fixing_series,
        base_currency=base_currency.strip().upper(),
    )


__all__ = [
    "DiscountCurve",
    "ForwardCurve",
    "FXForwardCurve",
    "BasisCurve",
    "FixingSeries",
    "MarketDataContext",
    "build_market_data_context_from_bundle",
]
