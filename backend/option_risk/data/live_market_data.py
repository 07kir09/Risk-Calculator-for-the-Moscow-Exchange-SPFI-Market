"""Live market-data sync from CBR + MOEX public APIs.

Builds files compatible with the existing market-data bundle loader:
- curveDiscount.xlsx
- curveForward.xlsx
- fixing.xlsx
- RC_*.xlsx (optional FX history files)
"""
from __future__ import annotations

import datetime as dt
import json
import math
import ssl
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable

import pandas as pd


_CBR_DYNAMIC_XML = "http://www.cbr.ru/scripts/XML_dynamic.asp"
_CBR_DWS_URL = "http://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx"
_MOEX_HISTORY_URL = "http://iss.moex.com/iss/history/engines/currency/markets/selt/securities/{secid}.json"

_CBR_VALUTE_ID_BY_CODE: dict[str, str] = {
    "USD": "R01235",
    "EUR": "R01239",
    "CNY": "R01375",
}

_MOEX_SECID_BY_CODE: dict[str, str] = {
    "USD": "USD000UTSTOM",
    "CNY": "CNYRUB_TOM",
}

_TENORS: tuple[tuple[str, float], ...] = (
    ("1W", 7.0 / 365.0),
    ("1M", 1.0 / 12.0),
    ("3M", 0.25),
    ("6M", 0.50),
    ("1Y", 1.00),
    ("2Y", 2.00),
    ("3Y", 3.00),
    ("5Y", 5.00),
    ("7Y", 7.00),
    ("10Y", 10.00),
)


@dataclass
class LiveMarketSyncStats:
    as_of_date: dt.date
    lookback_days: int
    fx_rows: int
    key_rate_rows: int
    ruonia_rows: int


def _http_get_text(url: str, *, timeout: float = 15.0, retries: int = 2) -> str:
    last_error: Exception | None = None
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(url=url, headers={"User-Agent": "option-risk-live-sync/1.0"})
            with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as resp:
                payload = resp.read()
            for encoding in ("utf-8", "windows-1251", "cp1251"):
                try:
                    return payload.decode(encoding)
                except UnicodeDecodeError:
                    continue
            return payload.decode("utf-8", errors="replace")
        except Exception as exc:  # pragma: no cover - network/runtime dependent
            last_error = exc
    raise RuntimeError(f"GET request failed for {url}: {last_error}") from last_error


def _http_post_soap(action: str, body_xml: str, *, timeout: float = 20.0, retries: int = 2) -> str:
    payload = body_xml.encode("utf-8")
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f"\"http://web.cbr.ru/{action}\"",
        "User-Agent": "option-risk-live-sync/1.0",
    }
    last_error: Exception | None = None
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(url=_CBR_DWS_URL, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as resp:
                raw = resp.read()
            return raw.decode("utf-8", errors="replace")
        except Exception as exc:  # pragma: no cover - network/runtime dependent
            last_error = exc
    raise RuntimeError(f"SOAP request failed for {action}: {last_error}") from last_error


def _to_iso_date(value: str) -> dt.date:
    text = str(value).strip()
    if "T" in text:
        text = text.split("T", 1)[0]
    try:
        return dt.date.fromisoformat(text)
    except ValueError:
        return dt.datetime.strptime(text, "%d.%m.%Y").date()


def _to_float(value: str) -> float:
    return float(str(value).replace(" ", "").replace(",", "."))


def _soap_envelope(operation: str, from_date: dt.date, to_date: dt.date) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xmlns:xsd="http://www.w3.org/2001/XMLSchema" '
        'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
        "<soap:Body>"
        f'<{operation} xmlns="http://web.cbr.ru/">'
        f"<fromDate>{from_date.isoformat()}T00:00:00</fromDate>"
        f"<ToDate>{to_date.isoformat()}T00:00:00</ToDate>"
        f"</{operation}>"
        "</soap:Body>"
        "</soap:Envelope>"
    )


def _fetch_cbr_key_rate(from_date: dt.date, to_date: dt.date) -> pd.DataFrame:
    xml = _http_post_soap("KeyRateXML", _soap_envelope("KeyRateXML", from_date, to_date))
    root = ET.fromstring(xml)
    rows: list[dict[str, object]] = []
    nodes = root.findall(".//KR") or root.findall(".//{*}KR")
    for node in nodes:
        dt_text = node.findtext("DT") or node.findtext("{*}DT")
        rate_text = node.findtext("Rate") or node.findtext("{*}Rate")
        if not dt_text or not rate_text:
            continue
        rows.append({"date": _to_iso_date(dt_text), "rate": _to_float(rate_text) / 100.0})
    if not rows:
        raise RuntimeError("CBR KeyRateXML returned empty data")
    frame = pd.DataFrame(rows).drop_duplicates(subset=["date"], keep="last").sort_values("date")
    return frame.reset_index(drop=True)


def _fetch_cbr_ruonia(from_date: dt.date, to_date: dt.date) -> pd.DataFrame:
    xml = _http_post_soap("RuoniaXML", _soap_envelope("RuoniaXML", from_date, to_date))
    root = ET.fromstring(xml)
    rows: list[dict[str, object]] = []
    nodes = root.findall(".//ro") or root.findall(".//{*}ro")
    for node in nodes:
        dt_text = node.findtext("D0") or node.findtext("{*}D0")
        ruo_text = node.findtext("ruo") or node.findtext("{*}ruo")
        if not dt_text or not ruo_text:
            continue
        rows.append({"date": _to_iso_date(dt_text), "rate": _to_float(ruo_text) / 100.0})
    if not rows:
        raise RuntimeError("CBR RuoniaXML returned empty data")
    frame = pd.DataFrame(rows).drop_duplicates(subset=["date"], keep="last").sort_values("date")
    return frame.reset_index(drop=True)


def _fetch_cbr_fx_dynamic(code: str, valute_id: str, from_date: dt.date, to_date: dt.date) -> pd.DataFrame:
    query = urllib.parse.urlencode(
        {
            "date_req1": from_date.strftime("%d/%m/%Y"),
            "date_req2": to_date.strftime("%d/%m/%Y"),
            "VAL_NM_RQ": valute_id,
        }
    )
    xml = _http_get_text(f"{_CBR_DYNAMIC_XML}?{query}")
    root = ET.fromstring(xml)
    rows: list[dict[str, object]] = []
    for node in root.findall(".//Record"):
        date_attr = node.attrib.get("Date")
        nominal_text = node.findtext("Nominal")
        value_text = node.findtext("Value")
        if not date_attr or not nominal_text or not value_text:
            continue
        rows.append(
            {
                "currency_code": code,
                "currency_label": code,
                "nominal": _to_float(nominal_text),
                "obs_date": _to_iso_date(date_attr),
                "rate": _to_float(value_text),
            }
        )
    return pd.DataFrame(rows)


def _fetch_moex_fx_history(code: str, secid: str, from_date: dt.date, to_date: dt.date) -> pd.DataFrame:
    query = urllib.parse.urlencode(
        {
            "from": from_date.isoformat(),
            "till": to_date.isoformat(),
            "iss.meta": "off",
            "iss.only": "history",
        }
    )
    text = _http_get_text(_MOEX_HISTORY_URL.format(secid=secid) + "?" + query)
    payload = json.loads(text)
    history = payload.get("history", {})
    columns = history.get("columns", [])
    data = history.get("data", [])
    if not columns or not data:
        return pd.DataFrame(columns=["currency_code", "obs_date", "rate"])
    index = {name: idx for idx, name in enumerate(columns)}
    required = ("BOARDID", "TRADEDATE", "CLOSE", "WAPRICE")
    if any(key not in index for key in required):
        return pd.DataFrame(columns=["currency_code", "obs_date", "rate"])

    rows: list[dict[str, object]] = []
    for item in data:
        board = str(item[index["BOARDID"]])
        if board != "CETS":
            continue
        trade_date = str(item[index["TRADEDATE"]]).strip()
        close_raw = item[index["CLOSE"]]
        wap_raw = item[index["WAPRICE"]]
        close = float(close_raw) if close_raw not in (None, "", 0, "0") else math.nan
        wap = float(wap_raw) if wap_raw not in (None, "", 0, "0") else math.nan
        price = close if math.isfinite(close) and close > 0.0 else wap
        if not math.isfinite(price) or price <= 0.0:
            continue
        rows.append({"currency_code": code, "obs_date": dt.date.fromisoformat(trade_date), "rate": float(price)})
    if not rows:
        return pd.DataFrame(columns=["currency_code", "obs_date", "rate"])
    return pd.DataFrame(rows).drop_duplicates(subset=["obs_date"], keep="last").sort_values("obs_date")


def _tenor_labels() -> Iterable[tuple[str, float]]:
    return _TENORS


def _build_curve_discount_frame(as_of_date: dt.date, base_rate: float) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for label, tenor in _tenor_labels():
        curve_rate = max(base_rate + 0.0004 * min(tenor, 5.0), 0.0001)
        discount_factor = math.exp(-curve_rate * tenor)
        rows.append(
            {
                "Дата": as_of_date.isoformat(),
                "Кривая": "RUB-DISCOUNT-RUB-CSA",
                "Тип": "Дисконтная",
                "Дисконт фактор": discount_factor,
                "Тенор": tenor,
                "Ставка": curve_rate,
            }
        )
    return pd.DataFrame(rows)


def _build_curve_forward_frame(as_of_date: dt.date, key_rate: float, ruonia: float) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    specs = (
        ("RUB-CBR-KEY-RATE", key_rate, 0.0),
        ("RUB-RUONIA-OIS-COMPOUND", ruonia, 0.0),
        ("RUB-RUSFAR-OIS-COMPOUND", ruonia, 0.0008),
        ("RUB-RUSFAR-3M", max(key_rate, ruonia), 0.0012),
    )
    for curve_name, base, spread in specs:
        for label, tenor in _tenor_labels():
            rate = max(base + spread + 0.0005 * min(tenor, 3.0), 0.0001)
            rows.append(
                {
                    "Дата": as_of_date.isoformat(),
                    "Кривая": curve_name,
                    "Тип": "Форвардная",
                    "Срок": label,
                    "Тенор": tenor,
                    "Ставка": rate,
                }
            )
    return pd.DataFrame(rows)


def _build_fixings_frame(key_rate_series: pd.DataFrame, ruonia_series: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for item in key_rate_series.itertuples(index=False):
        rows.append({"Индекс": "RUB KEYRATE", "Фиксинг": float(item.rate), "Дата": item.date.isoformat()})
    for item in ruonia_series.itertuples(index=False):
        ruo = float(item.rate)
        rows.append({"Индекс": "RUONIA", "Фиксинг": ruo, "Дата": item.date.isoformat()})
        rows.append({"Индекс": "RUSFAR RUB O/N", "Фиксинг": ruo + 0.0008, "Дата": item.date.isoformat()})
        rows.append({"Индекс": "RUSFAR RUB 3M", "Фиксинг": ruo + 0.0012, "Дата": item.date.isoformat()})
    return pd.DataFrame(rows)


def _build_fx_frames(
    from_date: dt.date,
    to_date: dt.date,
    currencies: Iterable[str],
) -> Dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    for raw_code in currencies:
        code = raw_code.strip().upper()
        valute_id = _CBR_VALUTE_ID_BY_CODE.get(code)
        if not valute_id:
            continue
        cbr_frame = _fetch_cbr_fx_dynamic(code, valute_id, from_date, to_date)
        if cbr_frame.empty:
            continue
        if code in _MOEX_SECID_BY_CODE:
            moex = _fetch_moex_fx_history(code, _MOEX_SECID_BY_CODE[code], from_date, to_date)
            if not moex.empty:
                merged = cbr_frame.set_index("obs_date")
                for item in moex.itertuples(index=False):
                    merged.loc[item.obs_date, ["currency_code", "currency_label", "nominal", "rate"]] = [
                        code,
                        code,
                        1.0,
                        float(item.rate),
                    ]
                cbr_frame = merged.reset_index()
        cbr_frame = cbr_frame.sort_values("obs_date").drop_duplicates(subset=["obs_date"], keep="last")
        out[code] = cbr_frame.reset_index(drop=True)
    return out


def sync_live_market_data_to_directory(
    target_dir: Path,
    *,
    as_of_date: dt.date | None = None,
    lookback_days: int = 180,
    currencies: Iterable[str] = ("USD", "EUR", "CNY"),
) -> LiveMarketSyncStats:
    target_dir = Path(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    as_of = as_of_date or dt.date.today()
    lookback = max(int(lookback_days), 14)
    from_date = as_of - dt.timedelta(days=lookback)

    key_rate_series = _fetch_cbr_key_rate(from_date, as_of)
    ruonia_series = _fetch_cbr_ruonia(from_date, as_of)
    fx_frames = _build_fx_frames(from_date, as_of, currencies)

    key_rate_last = float(key_rate_series.iloc[-1]["rate"])
    ruonia_last = float(ruonia_series.iloc[-1]["rate"])

    curve_discount = _build_curve_discount_frame(as_of, key_rate_last)
    curve_forward = _build_curve_forward_frame(as_of, key_rate_last, ruonia_last)
    fixings = _build_fixings_frame(key_rate_series, ruonia_series)

    curve_discount.to_excel(target_dir / "curveDiscount.xlsx", index=False)
    curve_forward.to_excel(target_dir / "curveForward.xlsx", index=False)
    fixings.to_excel(target_dir / "fixing.xlsx", index=False)

    fx_rows = 0
    for code, frame in fx_frames.items():
        fx_rows += len(frame)
        export = pd.DataFrame(
            {
                "nominal": frame["nominal"].astype(float),
                "data": frame["obs_date"].map(lambda v: v.strftime("%Y-%m-%d")),
                "curs": frame["rate"].astype(float),
                "cdx": code,
            }
        )
        export.to_excel(target_dir / f"RC_{code}.xlsx", index=False)

    return LiveMarketSyncStats(
        as_of_date=as_of,
        lookback_days=lookback,
        fx_rows=fx_rows,
        key_rate_rows=len(key_rate_series),
        ruonia_rows=len(ruonia_series),
    )


__all__ = ["LiveMarketSyncStats", "sync_live_market_data_to_directory"]
