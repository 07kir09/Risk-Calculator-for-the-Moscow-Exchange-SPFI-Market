from __future__ import annotations

import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
TEST_DATA = ROOT / "test_data"
REPORTS = ROOT / "reports"
BACKEND_URL = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
JSON_HEADERS = {"Content-Type": "application/json"}
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def http(method: str, path: str, *, body: bytes | None = None, headers: dict[str, str] | None = None, timeout: float = 20) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(f"{BACKEND_URL}{path}", data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc


def post_json(path: str, payload: dict, timeout: float = 30) -> tuple[int, dict[str, str], bytes]:
    return http("POST", path, body=json.dumps(payload).encode("utf-8"), headers=JSON_HEADERS, timeout=timeout)


def multipart_upload(path: Path, *, upload_name: str = "curveDiscount.xlsx", session_id: str | None = None) -> tuple[int, dict[str, str], bytes]:
    boundary = f"----audit-{uuid4().hex}"
    parts: list[bytes] = []
    if session_id:
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{session_id}\r\n".encode()
        )
    payload = path.read_bytes()
    parts.append(
        (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"file\"; filename=\"{upload_name}\"\r\n"
            f"Content-Type: {XLSX_MIME}\r\n\r\n"
        ).encode()
        + payload
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    return http("POST", "/market-data/upload", body=b"".join(parts), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}, timeout=60)


def parse_json(raw: bytes) -> object | None:
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def clean_error(status: int, headers: dict[str, str], raw: bytes) -> tuple[bool, str]:
    text = raw.decode("utf-8", errors="replace")
    ctype = headers.get("content-type", headers.get("Content-Type", ""))
    if status < 400:
        return True, "not an error"
    bad_markers = ["Traceback", "<html", "File \"", "/Users/", "backend/option_risk"]
    if "application/json" not in ctype.lower():
        return False, f"non-json error content-type={ctype}"
    for marker in bad_markers:
        if marker in text:
            return False, f"leaks {marker!r}"
    data = parse_json(raw)
    if not isinstance(data, dict) or not data.get("message"):
        return False, "missing JSON message"
    return True, str(data.get("message"))


def portfolio_from_csv(path: Path, limit: int | None = None, *, coerce_numbers: bool = True) -> list[dict[str, object]]:
    positions: list[dict[str, object]] = []
    numeric = {"quantity", "notional", "underlying_price", "strike", "volatility", "risk_free_rate", "dividend_yield", "liquidity_haircut"}
    with path.open(encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            out: dict[str, object] = {}
            for key, value in row.items():
                if value == "":
                    continue
                out[key] = float(value) if coerce_numbers and key in numeric else value
            positions.append(out)
            if limit and len(positions) >= limit:
                break
    return positions


def large_portfolio_positions() -> list[dict[str, object]] | None:
    path = REPO / "Datasets" / "portfolio_large_1000.xlsx"
    if not path.exists():
        return None
    try:
        import pandas as pd
    except Exception:
        return None
    df = pd.read_excel(path, nrows=1000)
    records = json.loads(df.where(df.notna(), None).to_json(orient="records"))
    return records


def minimal_payload(*, positions: list[dict[str, object]] | None = None, include: list[str] | None = None, limits: dict | None = None, mode: str = "demo") -> dict:
    payload: dict[str, object] = {
        "positions": positions or portfolio_from_csv(TEST_DATA / "portfolio_minimal_valid.csv"),
        "scenarios": [
            {"scenario_id": "shock_down", "underlying_shift": -0.05, "volatility_shift": 0.02, "rate_shift": 0.0},
            {"scenario_id": "shock_up", "underlying_shift": 0.05, "volatility_shift": -0.01, "rate_shift": 0.0},
        ],
        "alpha": 0.99,
        "horizon_days": 10,
        "base_currency": "RUB",
        "liquidity_model": "fraction_of_position_value",
        "mode": mode,
        "calc_sensitivities": True,
        "calc_var_es": True,
        "calc_stress": True,
        "calc_margin_capital": True,
    }
    if include is not None:
        payload["include"] = include
    if limits is not None:
        payload["limits"] = limits
    return payload


def row(name: str, expected: str, fact: str, ok: bool, comment: str = "") -> dict[str, str]:
    print(f"{'PASS' if ok else 'FAIL'} {name} {fact} {comment}".strip())
    return {"check": name, "expected": expected, "fact": fact, "ok": "PASS" if ok else "FAIL", "comment": comment}


def write_report(rows: list[dict[str, str]]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    lines = ["# Backend runtime report", "", "| Проверка | Ожидание | Факт | Pass/Fail | Комментарий |", "| --- | --- | --- | --- | --- |"]
    for item in rows:
        lines.append(f"| {item['check']} | {item['expected']} | {item['fact']} | {item['ok']} | {item['comment']} |")
    (REPORTS / "backend_runtime_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    rows: list[dict[str, str]] = []
    try:
        status, headers, raw = http("GET", "/health", timeout=3)
    except RuntimeError:
        rows.append(row("backend_running", "backend responds", "connection failed", False, "Start with: PYTHONPATH=backend uvicorn option_risk.api:app --app-dir backend --reload --port 8000"))
        write_report(rows)
        return 1
    rows.append(row("GET /health", "200 JSON", f"{status} {raw[:80]!r}", status == 200 and parse_json(raw) == {"status": "ok"}))

    for path in ["/limits", "/scenarios", "/market-data/health"]:
        status, headers, raw = http("GET", path)
        rows.append(row(f"GET {path}", "200 JSON", str(status), status == 200 and parse_json(raw) is not None, raw[:120].decode("utf-8", "replace")))

    upload_cases = [
        ("valid_small_xlsx", "market_data_valid_small.xlsx", 200),
        ("empty_xlsx", "market_data_empty.xlsx", 400),
        ("xlsx_5000_rows", "market_data_5000_rows.xlsx", 200),
        ("xlsx_5001_rows", "market_data_5001_rows.xlsx", 400),
        ("write_only_5001_rows", "market_data_write_only_5001_rows.xlsx", 400),
        ("corrupted_xlsx", "corrupted.xlsx", 400),
    ]
    for name, filename, expected_status in upload_cases:
        status, headers, raw = multipart_upload(TEST_DATA / filename)
        clean, clean_reason = clean_error(status, headers, raw)
        rows.append(row(f"POST /market-data/upload {name}", str(expected_status), str(status), status == expected_status and clean, clean_reason))

    status, headers, raw = post_json("/metrics", minimal_payload())
    data = parse_json(raw)
    rows.append(row("POST /metrics minimal", "200 metrics JSON", str(status), status == 200 and isinstance(data, dict) and "validation_log" in data, raw[:160].decode("utf-8", "replace")))

    large_positions = large_portfolio_positions()
    if large_positions is None:
        rows.append(row("POST /metrics portfolio_large_1000", "200 or clean error", "NOT RUN", False, "portfolio file missing or pandas unavailable"))
    else:
        status, headers, raw = post_json("/metrics", minimal_payload(positions=large_positions), timeout=120)
        clean, clean_reason = clean_error(status, headers, raw)
        rows.append(row("POST /metrics portfolio_large_1000 without FX", "400 clean missing FX error", str(status), status == 400 and clean and "USD/RUB" in clean_reason, clean_reason))
        payload_with_fx = minimal_payload(positions=large_positions)
        payload_with_fx["fx_rates"] = {"USD": 92.0}
        status, headers, raw = post_json("/metrics", payload_with_fx, timeout=120)
        clean, clean_reason = clean_error(status, headers, raw)
        rows.append(row("POST /metrics portfolio_large_1000 with FX", "200 metrics JSON", str(status), status == 200 and clean, clean_reason))

    write_report(rows)
    return 0 if all(item["ok"] == "PASS" for item in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
