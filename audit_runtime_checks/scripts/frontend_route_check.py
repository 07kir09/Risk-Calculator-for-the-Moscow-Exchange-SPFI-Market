from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
REPORTS = ROOT / "reports"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:5173").rstrip("/")


def write_report(rows: list[dict[str, str]]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    lines = ["# Frontend runtime report", "", "| Страница | Проверка | Факт | Pass/Fail | UX/Logic comment |", "| --- | --- | --- | --- | --- |"]
    for row in rows:
        lines.append(f"| {row['page']} | {row['check']} | {row['fact']} | {row['ok']} | {row['comment']} |")
    (REPORTS / "frontend_runtime_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    frontend = REPO / "frontend"
    js = r"""
const { chromium } = await import('playwright');
const base = process.argv[1];
const routes = ['/', '/import', '/market', '/configure', '/dashboard', '/stress', '/limits', '/export'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const rows = [];
const seedPage = await context.newPage();
await seedPage.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await seedPage.evaluate(() => {
  const now = new Date().toISOString();
  const position = {
    instrument_type: 'forward', position_id: 'audit_seed_forward', option_type: 'call', style: 'european',
    quantity: 1, notional: 1000, underlying_symbol: 'IMOEX', underlying_price: 3400, strike: 3350,
    volatility: 0, maturity_date: '2026-09-30', valuation_date: '2026-04-25',
    risk_free_rate: 0.12, dividend_yield: 0, currency: 'RUB', liquidity_haircut: 0.01,
  };
  const metrics = {
    base_value: 47524.15, var_hist: 161412.99, es_hist: 161412.99, var_param: 1679300.02,
    es_param: 1923916.33, lc_var: 161888.95, lc_var_addon: 476.0, lc_var_breakdown: [],
    greeks: null,
    stress: [
      { scenario_id: 'shock_down', pnl: -125000, limit: 200000, breached: false },
      { scenario_id: 'shock_up', pnl: 85000, limit: 200000, breached: false },
    ],
    top_contributors: { var_hist: [{ metric: 'var_hist', position_id: 'audit_seed_forward', scenario_id: 'shock_down', pnl_contribution: -125000, abs_pnl_contribution: 125000 }] },
    limits: [['var_hist', 161412.99, 200000, false], ['es_hist', 161412.99, 220000, false], ['lc_var', 161888.95, 230000, false]],
    correlations: null, pnl_matrix: null, pnl_distribution: [-125000, 85000],
    buckets: { forward: { count: 1, notional: 1000 } }, base_currency: 'RUB',
    confidence_level: 0.99, horizon_days: 10, parametric_tail_model: 'cornish_fisher',
    mode: 'api', methodology_note: null, fx_warning: null, liquidity_model: 'fraction_of_position_value',
    config: {}, worst_stress: -125000, capital: 161412.99, initial_margin: 161888.95,
    variation_margin: -125000,
    validation_log: [{ severity: 'WARNING', message: 'Audit seeded validation warning', row: 2, field: 'quantity' }],
  };
  localStorage.setItem('app_data_v1', JSON.stringify({
    portfolio: { source: 'csv', importedAt: now, filename: 'portfolio_minimal_valid.csv', positions: [position] },
    validationLog: [{ severity: 'WARNING', message: 'Audit seeded validation warning', row: 2, field: 'quantity' }],
    scenarios: [
      { scenario_id: 'shock_down', underlying_shift: -0.05, volatility_shift: 0.02, rate_shift: 0 },
      { scenario_id: 'shock_up', underlying_shift: 0.05, volatility_shift: -0.01, rate_shift: 0 },
    ],
    limits: null,
    marketDataSummary: null,
    marketDataMode: 'api_auto',
    results: { metrics, computedAt: now },
  }));
  localStorage.setItem('workflow_state_v1', JSON.stringify({
    snapshotId: now,
    validation: { criticalErrors: 0, warnings: 1, acknowledged: true },
    marketData: { missingFactors: 0, status: 'ready' },
    calcConfig: {
      selectedMetrics: ['var_hist', 'es_hist', 'lc_var', 'stress'],
      params: { alpha: 0.99, horizonDays: 10, baseCurrency: 'RUB', liquidityModel: 'fraction_of_position_value' },
      marginEnabled: true,
    },
    calcRun: { calcRunId: 'audit', status: 'success', startedAt: now, finishedAt: now },
    completedSteps: ['S1_IMPORT', 'S2_VALIDATE', 'S3_MARKET', 'S4_CONFIG', 'S5_CALC', 'S6_RESULTS'],
  }));
});
await seedPage.close();
for (const route of routes) {
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', req => failedRequests.push(req.url() + ' ' + (req.failure()?.errorText || 'failed')));
  try {
    const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const titleText = await page.locator('h1, h2, [class*="Title"], [class*="title"]').first().textContent({ timeout: 3000 }).catch(() => '');
    const bodyText = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
    const white = bodyText.trim().length < 20;
    const labels = {
      xlsx: bodyText.includes('XLSX'),
      csv: bodyText.includes('CSV'),
      paste: bodyText.includes('Paste') || bodyText.includes('Встав'),
      validationLog: bodyText.includes('Журнал валидации') || bodyText.includes('validation'),
      correlations: bodyText.includes('Корреляции') || bodyText.includes('correlations'),
      manualLimits: bodyText.includes('Ручной') && bodyText.includes('Применить ручные'),
      export: bodyText.includes('Экспорт'),
    };
    rows.push({
      page: route,
      check: 'route opens',
      fact: `status=${response ? response.status() : 'none'} title=${String(titleText || '').slice(0, 80)}`,
      ok: response && response.ok() && !white ? 'PASS' : 'FAIL',
      comment: white ? 'white/near-empty screen' : ''
    });
    rows.push({ page: route, check: 'console errors', fact: String(consoleErrors.length), ok: consoleErrors.length === 0 ? 'PASS' : 'FAIL', comment: consoleErrors.slice(0, 2).join(' / ').replaceAll('|', '/') });
    rows.push({ page: route, check: 'failed network requests', fact: String(failedRequests.length), ok: failedRequests.length === 0 ? 'PASS' : 'FAIL', comment: failedRequests.slice(0, 2).join(' / ').replaceAll('|', '/') });
    if (route === '/import') rows.push({ page: route, check: 'XLSX/CSV/Paste labels', fact: JSON.stringify(labels), ok: labels.xlsx && labels.csv && labels.paste ? 'PASS' : 'FAIL', comment: '' });
    if (route === '/dashboard') rows.push({ page: route, check: 'validation/correlation notices', fact: JSON.stringify(labels), ok: labels.validationLog && labels.correlations ? 'PASS' : 'FAIL', comment: '' });
    if (route === '/limits') rows.push({ page: route, check: 'manual limits controls', fact: JSON.stringify(labels), ok: labels.manualLimits ? 'PASS' : 'FAIL', comment: '' });
    if (route === '/export') rows.push({ page: route, check: 'export page content', fact: JSON.stringify(labels), ok: labels.export ? 'PASS' : 'FAIL', comment: '' });
  } catch (error) {
    rows.push({ page: route, check: 'route opens', fact: 'exception', ok: 'FAIL', comment: String(error).replaceAll('|', '/') });
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify(rows, null, 2));
"""
    try:
        result = subprocess.run(["node", "--input-type=module", "-e", js, FRONTEND_URL], cwd=frontend, text=True, capture_output=True, timeout=120)
    except FileNotFoundError:
        rows = [{"page": "*", "check": "frontend checker", "fact": "node missing", "ok": "FAIL", "comment": "Node.js is required"}]
        write_report(rows)
        print("FAIL frontend_route_check node missing")
        return 1
    if result.returncode != 0:
        rows = [{"page": "*", "check": "frontend checker", "fact": f"exit={result.returncode}", "ok": "FAIL", "comment": (result.stdout + result.stderr).replace("|", "/")[:500]}]
        write_report(rows)
        print(f"FAIL frontend_route_check exit={result.returncode} {(result.stdout + result.stderr)[:500]}")
        return 1
    rows = json.loads(result.stdout)
    write_report(rows)
    for row in rows:
        print(f"{row['ok']} {row['page']} {row['check']} {row['fact']} {row['comment']}".strip())
    return 0 if all(row["ok"] == "PASS" for row in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
