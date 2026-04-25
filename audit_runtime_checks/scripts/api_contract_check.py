from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from backend_smoke_check import BACKEND_URL, REPORTS, minimal_payload, parse_json, post_json, http


def check(name: str, expected: str, fact: str, ok: bool, comment: str = "") -> dict[str, str]:
    print(f"{'PASS' if ok else 'FAIL'} {name} {fact} {comment}".strip())
    return {"name": name, "expected": expected, "fact": fact, "ok": "PASS" if ok else "FAIL", "comment": comment}


def node_zod_check(metrics_response: object) -> tuple[bool, str]:
    repo = Path(__file__).resolve().parents[2]
    frontend = repo / "frontend"
    script = """
import { z } from 'zod';
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const n = () => z.number();
const nOpt = () => z.number().nullable().optional();
const arrOpt = (item) => z.array(item).nullable().optional();
const validationLogEntrySchema = z.object({
  severity: z.enum(['INFO', 'WARNING', 'ERROR']),
  message: z.string(),
  row: z.number().int().nullable().optional(),
  field: z.string().nullable().optional(),
}).strict();
const lcBreakdownRowSchema = z.object({
  position_id: z.string(), model: z.string(), quantity: z.number(),
  position_value: z.number(), haircut_input: z.number(), add_on_money: z.number(),
}).strict();
const contributorRowSchema = z.object({
  metric: z.string().optional(), position_id: z.string(), scenario_id: z.string().optional(),
  pnl_contribution: z.number(), abs_pnl_contribution: z.number(),
}).strict();
const dataQualitySchema = z.object({
  market_data_completeness: z.enum(['complete', 'incomplete']).default('complete'),
  missing_curves: z.array(z.string()).default([]),
  missing_fx: z.array(z.string()).default([]),
  affected_positions: z.array(z.string()).default([]),
  partial_positions_count: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
}).strict();
const metricsSchema = z.object({
  base_value: z.number().nullable(),
  var_hist: nOpt(), es_hist: nOpt(), var_param: nOpt(), es_param: nOpt(),
  lc_var: nOpt(), lc_var_addon: nOpt(), lc_var_breakdown: arrOpt(lcBreakdownRowSchema),
  greeks: z.record(n()).nullable().optional(),
  stress: arrOpt(z.object({ scenario_id: z.string(), pnl: z.number(), limit: nOpt(), breached: z.boolean() }).strict()),
  limits: arrOpt(z.tuple([z.string(), z.number(), z.number(), z.boolean()])),
  correlations: arrOpt(z.array(n())), pnl_matrix: arrOpt(z.array(n())), pnl_distribution: arrOpt(n()),
  top_contributors: z.record(z.array(contributorRowSchema)).nullable().optional(),
  buckets: z.record(z.record(n())).nullable().optional(),
  base_currency: z.string().optional(), confidence_level: nOpt(), horizon_days: z.number().int().nullable().optional(),
  parametric_tail_model: z.string().optional(), mode: z.string().optional(),
  methodology_note: z.string().nullable().optional(), fx_warning: z.string().nullable().optional(),
  liquidity_model: z.string().optional(), config: z.record(z.unknown()).nullable().optional(),
  worst_stress: nOpt(), capital: nOpt(), initial_margin: nOpt(), variation_margin: nOpt(),
  calculation_status: z.enum(['complete']).optional().default('complete'),
  data_quality: dataQualitySchema.optional().default({
    market_data_completeness: 'complete',
    missing_curves: [],
    missing_fx: [],
    affected_positions: [],
    partial_positions_count: 0,
    warnings: [],
  }),
  market_data_completeness: z.enum(['complete', 'incomplete']).optional().default('complete'),
  market_data_source: z.string().nullable().optional(),
  methodology_status: z.string().nullable().optional(),
  valuation_label: z.string().optional().default('Net PV / MtM'),
  var_method: z.string().optional().default('scenario_quantile'),
  validation_log: z.array(validationLogEntrySchema).nullable().optional().transform((value) => value ?? []),
}).strict();
metricsSchema.parse(data);
console.log('PASS zod strict parse');
"""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as data_file:
        json.dump(metrics_response, data_file)
        data_path = data_file.name
    try:
        result = subprocess.run(["node", "--input-type=module", "-e", script, data_path], cwd=frontend, text=True, capture_output=True, timeout=30)
        return result.returncode == 0, (result.stdout + result.stderr).strip()
    finally:
        Path(data_path).unlink(missing_ok=True)


def write_report(rows: list[dict[str, str]]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    lines = ["# API contract report", "", "| Поле/endpoint | Ожидание | Факт | Pass/Fail | Комментарий |", "| --- | --- | --- | --- | --- |"]
    for item in rows:
        lines.append(f"| {item['name']} | {item['expected']} | {item['fact']} | {item['ok']} | {item['comment']} |")
    (REPORTS / "api_contract_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    rows: list[dict[str, str]] = []
    try:
        status, _, raw = post_json("/metrics", minimal_payload())
    except Exception as exc:
        rows.append(check("/metrics", "200", "connection failed", False, str(exc)))
        write_report(rows)
        return 1
    data = parse_json(raw)
    rows.append(check("/metrics status", "200", str(status), status == 200 and isinstance(data, dict)))
    if isinstance(data, dict):
        rows.append(check("base_value", "nullable number accepted", type(data.get("base_value")).__name__, data.get("base_value") is None or isinstance(data.get("base_value"), (int, float))))
        severities = {entry.get("severity") for entry in data.get("validation_log", []) if isinstance(entry, dict)}
        rows.append(check("severity", "INFO/WARNING/ERROR only", ",".join(sorted(map(str, severities))) or "empty", severities.issubset({"INFO", "WARNING", "ERROR"})))
        rows.append(check("validation_log", "present list", type(data.get("validation_log")).__name__, isinstance(data.get("validation_log"), list)))
        rows.append(check("calculation_status", "complete", str(data.get("calculation_status")), data.get("calculation_status") == "complete"))
        rows.append(check("valuation_label", "Net PV / MtM", str(data.get("valuation_label")), data.get("valuation_label") == "Net PV / MtM"))
        rows.append(check("var_method", "scenario_quantile", str(data.get("var_method")), data.get("var_method") == "scenario_quantile"))
        rows.append(check("data_quality", "present object", type(data.get("data_quality")).__name__, isinstance(data.get("data_quality"), dict)))
        rows.append(check("correlations default", "null/absent by default", str(data.get("correlations"))[:80], data.get("correlations") is None))
        rows.append(check("top_contributors", "object or null", type(data.get("top_contributors")).__name__, data.get("top_contributors") is None or isinstance(data.get("top_contributors"), dict)))
        rows.append(check("limits", "list/null", type(data.get("limits")).__name__, data.get("limits") is None or isinstance(data.get("limits"), list)))
        ok, msg = node_zod_check(data)
        rows.append(check("frontend Zod strict parse", "pass", msg.replace("|", "/")[:240], ok))

    status_inc, _, raw_inc = post_json("/metrics?include=correlations", minimal_payload())
    data_inc = parse_json(raw_inc)
    corr = data_inc.get("correlations") if isinstance(data_inc, dict) else None
    rows.append(check("include=correlations", "not silently ignored", f"status={status_inc} correlations_type={type(corr).__name__}", status_inc == 200 and corr is not None))

    for path in ["/limits", "/scenarios"]:
        status, _, raw = http("GET", path)
        rows.append(check(path, "200 JSON", str(status), status == 200 and parse_json(raw) is not None, raw[:120].decode("utf-8", "replace")))

    write_report(rows)
    return 0 if all(item["ok"] == "PASS" for item in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
