from __future__ import annotations

import json
from pathlib import Path

from backend_smoke_check import clean_error, http, minimal_payload, multipart_upload, parse_json, portfolio_from_csv, post_json, row


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "test_data" / "data_api_completeness"
REPORTS = ROOT / "reports"


def upload_bundle(fx_filename: str | None) -> tuple[str | None, list[dict[str, str]]]:
    rows: list[dict[str, str]] = []
    session_id: str | None = None
    for filename in ["curveDiscount.xlsx", "curveForward.xlsx", "fixing.xlsx"]:
        status, headers, raw = multipart_upload(DATA_DIR / filename, upload_name=filename, session_id=session_id)
        data = parse_json(raw)
        if isinstance(data, dict):
            session_id = str(data.get("session_id") or session_id or "")
        clean, reason = clean_error(status, headers, raw)
        rows.append(row(f"upload {filename}", "200", str(status), status == 200 and clean, reason))
    if fx_filename:
        status, headers, raw = multipart_upload(DATA_DIR / fx_filename, upload_name=fx_filename, session_id=session_id)
        data = parse_json(raw)
        if isinstance(data, dict):
            session_id = str(data.get("session_id") or session_id or "")
        clean, reason = clean_error(status, headers, raw)
        rows.append(row(f"upload {fx_filename}", "200", str(status), status == 200 and clean, reason))
    return session_id, rows


def metrics_payload(portfolio_filename: str, *, session_id: str | None, numeric: bool = False) -> dict:
    payload = minimal_payload(positions=portfolio_from_csv(DATA_DIR / portfolio_filename), mode="api")
    payload.update(
        {
            "market_data_session_id": session_id,
            "auto_market_data": False,
            "calc_sensitivities": False,
            "calc_var_es": numeric,
            "calc_stress": numeric,
            "calc_margin_capital": numeric,
            "calc_correlations": False,
        }
    )
    if numeric:
        payload["alpha"] = 0.95
        payload["scenarios"] = [
            {"scenario_id": "down", "underlying_shift": -0.1, "volatility_shift": 0.0, "rate_shift": 0.0},
            {"scenario_id": "base", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
            {"scenario_id": "up", "underlying_shift": 0.1, "volatility_shift": 0.0, "rate_shift": 0.0},
        ]
    return payload


def metrics_json(portfolio_filename: str, *, session_id: str | None, numeric: bool = False) -> tuple[int, dict | None, bytes]:
    status, _headers, raw = post_json("/metrics", metrics_payload(portfolio_filename, session_id=session_id, numeric=numeric))
    data = parse_json(raw)
    return status, data if isinstance(data, dict) else None, raw


def metrics_for(portfolio_filename: str, *, session_id: str | None) -> tuple[int, str]:
    status, data, raw = metrics_json(portfolio_filename, session_id=session_id)
    if data is not None:
        return status, str(data.get("message") or data.get("base_value") or data)[:240]
    return status, raw[:240].decode("utf-8", "replace")


def numeric_metrics(fx_file: str) -> tuple[int, dict | None]:
    session_id, _upload_rows = upload_bundle(fx_file)
    status, data, _raw = metrics_json("portfolio_eur_usd.csv", session_id=session_id, numeric=True)
    return status, data


def metric_delta(left: dict, right: dict, metric: str) -> float:
    return abs(float(left[metric]) - float(right[metric]))


def equivalent(left: dict | None, right: dict | None, metrics: list[str], *, tolerance: float = 1e-7) -> tuple[bool, str]:
    if left is None or right is None:
        return False, "missing metrics body"
    deltas = {metric: metric_delta(left, right, metric) for metric in metrics}
    ok = all(delta <= tolerance for delta in deltas.values())
    return ok, ", ".join(f"{metric} delta={delta:.12g}" for metric, delta in deltas.items())
    status, _headers, raw = post_json("/metrics", payload)
    data = parse_json(raw)
    if isinstance(data, dict):
        return status, str(data.get("message") or data.get("base_value") or data)[:240]
    return status, raw[:240].decode("utf-8", "replace")


def session_fx_pairs(session_id: str | None) -> list[str]:
    if not session_id:
        return []
    status, _headers, raw = http("GET", f"/market-data/{session_id}")
    data = parse_json(raw)
    if status != 200 or not isinstance(data, dict):
        return []
    return list(data.get("available_fx_pairs") or [])


def write_report(rows: list[dict[str, str]]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    lines = ["# Data/API completeness report", "", "| Проверка | Ожидание | Факт | Pass/Fail | Комментарий |", "| --- | --- | --- | --- | --- |"]
    for item in rows:
        lines.append(f"| {item['check']} | {item['expected']} | {item['fact']} | {item['ok']} | {item['comment']} |")
    (REPORTS / "data_api_completeness_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    if not DATA_DIR.exists():
        print("FAIL test data missing; run python3 audit_runtime_checks/scripts/generate_data_api_completeness_files.py")
        return 1

    rows: list[dict[str, str]] = []
    try:
        status, _headers, raw = http("GET", "/health", timeout=3)
    except RuntimeError:
        print("FAIL backend is not running")
        return 1
    rows.append(row("backend health", "200", str(status), status == 200, raw[:80].decode("utf-8", "replace")))

    scenarios = [
        ("RUB-only portfolio", "portfolio_rub_only.csv", "market_data_without_fx.xlsx", 200, []),
        ("USD missing USD/RUB", "portfolio_usd_only.csv", "market_data_without_fx.xlsx", 400, ["USD/RUB"]),
        ("USD with USD/RUB", "portfolio_usd_only.csv", "market_data_fx_full.xlsx", 200, []),
        ("EUR+USD missing EUR/RUB", "portfolio_eur_usd.csv", "market_data_fx_missing_eur.xlsx", 400, ["EUR/RUB"]),
        ("EUR+USD full FX", "portfolio_eur_usd.csv", "market_data_fx_full.xlsx", 200, []),
        ("FX aliases", "portfolio_eur_usd.csv", "market_data_fx_aliases.xlsx", 200, []),
        ("inverse FX pairs", "portfolio_eur_usd.csv", "market_data_fx_inverse_pairs.xlsx", 200, []),
    ]

    for scenario_name, portfolio_file, fx_file, expected_status, expected_markers in scenarios:
        session_id, upload_rows = upload_bundle(fx_file)
        rows.extend(upload_rows)
        pairs = session_fx_pairs(session_id)
        status, fact = metrics_for(portfolio_file, session_id=session_id)
        markers_ok = all(marker in fact for marker in expected_markers)
        rows.append(
            row(
                scenario_name,
                f"/metrics {expected_status}; markers={json.dumps(expected_markers, ensure_ascii=False)}",
                f"{status}; available_fx={pairs}",
                status == expected_status and markers_ok,
                fact,
            )
        )

    numeric_fields = ["base_value", "var_hist", "es_hist", "lc_var", "initial_margin", "variation_margin"]
    direct_status, direct = numeric_metrics("market_data_fx_full.xlsx")
    alias_status, alias = numeric_metrics("market_data_fx_aliases.xlsx")
    inverse_status, inverse = numeric_metrics("market_data_fx_inverse_pairs.xlsx")
    wrong_inverse_status, wrong_inverse = numeric_metrics("market_data_fx_wrong_inverse.xlsx")
    alias_ok, alias_comment = equivalent(direct, alias, numeric_fields)
    inverse_ok, inverse_comment = equivalent(direct, inverse, numeric_fields)
    rows.append(row("numeric direct vs alias FX", "same metrics within 1e-7", f"{direct_status}/{alias_status}", direct_status == 200 and alias_status == 200 and alias_ok, alias_comment))
    rows.append(row("numeric direct vs inverse FX", "same metrics within 1e-7", f"{direct_status}/{inverse_status}", direct_status == 200 and inverse_status == 200 and inverse_ok, inverse_comment))
    wrong_delta = abs(float((wrong_inverse or {}).get("base_value", 0.0)) - float((direct or {}).get("base_value", 0.0)))
    rows.append(row("numeric wrong inverse sanity", "200 with clearly different base_value or clean validation error", str(wrong_inverse_status), wrong_inverse_status == 200 and wrong_delta > 100.0, f"base_value delta={wrong_delta:.12g}"))

    write_report(rows)
    return 0 if all(item["ok"] == "PASS" for item in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
