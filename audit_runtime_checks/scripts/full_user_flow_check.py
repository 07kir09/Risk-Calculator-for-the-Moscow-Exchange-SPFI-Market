from __future__ import annotations

import json
from pathlib import Path

from backend_smoke_check import REPORTS, TEST_DATA, clean_error, large_portfolio_positions, minimal_payload, multipart_upload, parse_json, portfolio_from_csv, post_json


def row(scenario: str, result: str, where: str, ok: bool, comment: str = "") -> dict[str, str]:
    print(f"{'PASS' if ok else 'FAIL'} {scenario} {where} {result} {comment}".strip())
    return {"scenario": scenario, "result": result, "where": where, "ok": "PASS" if ok else "FAIL", "comment": comment}


def write_report(rows: list[dict[str, str]]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Final audit report",
        "",
        "| Сценарий | Результат | Где сломалось | Pass/Fail | Комментарий |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in rows:
        lines.append(f"| {item['scenario']} | {item['result']} | {item['where']} | {item['ok']} | {item['comment']} |")
    (REPORTS / "final_audit_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    rows: list[dict[str, str]] = []

    status, _, raw = post_json("/metrics", minimal_payload(positions=portfolio_from_csv(TEST_DATA / "portfolio_minimal_valid.csv")))
    data = parse_json(raw)
    ok = status == 200 and isinstance(data, dict) and data.get("stress") and "validation_log" in data
    rows.append(row("A small valid portfolio", f"/metrics status={status}", "calculate", ok, raw[:180].decode("utf-8", "replace")))

    status_upload, headers_upload, raw_upload = multipart_upload(TEST_DATA / "market_data_valid_small.xlsx")
    clean, clean_reason = clean_error(status_upload, headers_upload, raw_upload)
    rows.append(row("A market-data upload", f"upload status={status_upload}", "market-data", status_upload == 200 and clean, clean_reason))

    large = large_portfolio_positions()
    if large is None:
        rows.append(row("B large portfolio", "NOT RUN", "load portfolio_large_1000.xlsx", False, "missing file or pandas unavailable"))
    else:
        status, _, raw = post_json("/metrics", minimal_payload(positions=large), timeout=120)
        data = parse_json(raw)
        missing_fx_ok = status == 400 and isinstance(data, dict) and "USD/RUB" in str(data.get("message", ""))
        rows.append(row("B large portfolio without FX", f"/metrics status={status}", "calculate", missing_fx_ok, raw[:180].decode("utf-8", "replace")))
        payload_with_fx = minimal_payload(positions=large)
        payload_with_fx["fx_rates"] = {"USD": 92.0}
        status, _, raw = post_json("/metrics", payload_with_fx, timeout=120)
        data = parse_json(raw)
        corr_default_ok = isinstance(data, dict) and data.get("correlations") is None
        ok = status == 200 and corr_default_ok
        rows.append(row("B large portfolio with explicit FX", f"/metrics status={status} correlations_default={None if not isinstance(data, dict) else data.get('correlations')}", "calculate", ok, raw[:180].decode("utf-8", "replace")))

    invalid_positions = portfolio_from_csv(TEST_DATA / "portfolio_invalid_types.csv", coerce_numbers=False)
    status, headers, raw = post_json("/metrics", minimal_payload(positions=invalid_positions))
    clean, clean_reason = clean_error(status, headers, raw)
    rows.append(row("C invalid portfolio", f"/metrics status={status}", "validation", status in {400, 422} and clean, clean_reason))

    for filename in ["corrupted.xlsx", "market_data_empty.xlsx", "market_data_5001_rows.xlsx"]:
        status, headers, raw = multipart_upload(TEST_DATA / filename)
        clean, clean_reason = clean_error(status, headers, raw)
        rows.append(row("D bad market-data", f"{filename} status={status}", "upload", status == 400 and clean, clean_reason))

    write_report(rows)
    return 0 if all(item["ok"] == "PASS" for item in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
