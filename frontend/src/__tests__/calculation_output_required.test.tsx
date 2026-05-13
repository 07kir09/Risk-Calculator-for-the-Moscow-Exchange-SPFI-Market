import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";
import App from "../App";
import { MetricsResponse } from "../api/contracts/metrics";
import { demoMetrics, demoPositions, demoScenarios } from "../mock/demoData";
import { formatNumber } from "../utils/format";
import { WorkflowStep } from "../workflow/workflowTypes";
import { renderWithProviders } from "./testUtils";

const requiredMetrics: MetricsResponse = {
  ...demoMetrics,
  base_value: 111111,
  var_hist: 2222,
  es_hist: 3333,
  lc_var: 4444,
  lc_var_addon: 0,
  capital: 3333,
  initial_margin: 4444,
  variation_margin: -555,
  stress: [
    { scenario_id: "shock_down", pnl: -2222, limit: 2000, breached: true },
    { scenario_id: "shock_up", pnl: 777, limit: 2000, breached: false },
  ],
  pnl_distribution: [-2222, 777],
  limits: [
    ["var_hist", 2222, 2000, true],
    ["es_hist", 3333, 4000, false],
    ["lc_var", 4444, 5000, false],
  ],
  top_contributors: {
    var_hist: [
      { metric: "var_hist", position_id: "call_eu", scenario_id: "shock_down", pnl_contribution: -1500, abs_pnl_contribution: 1500 },
      { metric: "var_hist", position_id: "fwd_fx", scenario_id: "shock_down", pnl_contribution: -722, abs_pnl_contribution: 722 },
    ],
    es_hist: [
      { metric: "es_hist", position_id: "call_eu", scenario_id: "tail_mean", pnl_contribution: -2500, abs_pnl_contribution: 2500 },
      { metric: "es_hist", position_id: "fwd_fx", scenario_id: "tail_mean", pnl_contribution: -833, abs_pnl_contribution: 833 },
    ],
    stress: [
      { metric: "stress", position_id: "call_eu", scenario_id: "shock_down", pnl_contribution: -1500, abs_pnl_contribution: 1500 },
      { metric: "stress", position_id: "fwd_fx", scenario_id: "shock_down", pnl_contribution: -722, abs_pnl_contribution: 722 },
    ],
  },
  validation_log: [{ severity: "WARNING", message: "Backend validation warning", field: "fx" }],
  base_currency: "RUB",
  confidence_level: 0.8,
  horizon_days: 1,
  limit_source: "manual_user",
  methodology_metadata: {
    methodology_status: "preliminary",
    limit_source: "manual_user",
    preliminary: true,
    draft_policy_note: "Пользовательские пороги требуют утверждения.",
    var_method: "scenario_quantile",
    scenario_count: 2,
    stress_source: "backend_calculated",
    backend_calculated: true,
    export_generated_at: null,
  },
};

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function createObjectUrlMock() {
  return URL.createObjectURL as unknown as {
    mock: { calls: Array<[Blob]> };
    mockClear: () => void;
  };
}

function seedResults(metrics: MetricsResponse = requiredMetrics) {
  localStorage.setItem(
    "workflow_state_v1",
    JSON.stringify({
      validation: { criticalErrors: 0, warnings: 0, acknowledged: true },
      marketData: { missingFactors: 0, status: "ready" },
      calcConfig: {
        selectedMetrics: ["var_hist", "es_hist", "lc_var", "stress"],
        params: { baseCurrency: "RUB", alpha: 0.8, horizonDays: 1 },
        marginEnabled: true,
      },
      calcRun: { status: "success" },
      completedSteps: [
        WorkflowStep.Import,
        WorkflowStep.Validate,
        WorkflowStep.MarketData,
        WorkflowStep.Configure,
        WorkflowStep.Results,
      ],
    })
  );
  localStorage.setItem(
    "app_data_v1",
    JSON.stringify({
      portfolio: { source: "demo", importedAt: "2026-04-25T00:00:00.000Z", positions: demoPositions },
      validationLog: [],
      scenarios: demoScenarios,
      limits: { var_hist: 2000, es_hist: 4000, lc_var: 5000 },
      limitSource: "manual_user",
      marketDataSummary: null,
      marketDataMode: "api_auto",
      results: { metrics, computedAt: "2026-04-25T00:00:00.000Z" },
    })
  );
}

function expectPageText(value: string) {
  const normalizedBody = (document.body.textContent ?? "").replace(/\s+/g, " ");
  expect(normalizedBody).toContain(value.replace(/\s+/g, " "));
}

test("dashboard_values_match_metrics_response", async () => {
  const user = userEvent.setup();
  seedResults();
  renderWithProviders(<App />, { route: "/dashboard" });

  expect(await screen.findByRole("heading", { name: /Панель риска/i })).toBeInTheDocument();
  expect(screen.getByText("Net PV / MtM портфеля")).toBeInTheDocument();
  expect(screen.queryByText("Стоимость портфеля")).not.toBeInTheDocument();
  expect(screen.getAllByText("Scenario VaR").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Scenario ES").length).toBeGreaterThan(0);
  expectPageText(formatNumber(requiredMetrics.base_value ?? 0, 0));
  expectPageText(formatNumber(requiredMetrics.var_hist ?? 0, 0));
  expectPageText(formatNumber(requiredMetrics.es_hist ?? 0, 0));
  expect(screen.getByRole("button", { name: /Журнал валидации расчёта/i })).toBeInTheDocument();
  expect(screen.getAllByText(/Источник порогов: manual_user/i).length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: /Факторы/i }));
  expect(await screen.findByText("Reference scenario P&L")).toBeInTheDocument();
  expectPageText(formatNumber(requiredMetrics.variation_margin ?? 0, 2));
});

test("limits_breaches_match_backend_metrics", async () => {
  seedResults();
  renderWithProviders(<App />, { route: "/limits" });

  expect(await screen.findByRole("heading", { name: /Контрольные пороги риска/i })).toBeInTheDocument();
  expect(screen.getByText(/Источник: manual_user/i)).toBeInTheDocument();
  expectPageText(formatNumber(2222, 2));
  expectPageText(formatNumber(2000, 2));
  expect(screen.getByText("Выше порога")).toBeInTheDocument();
});

test("export_values_match_metrics_response", async () => {
  const user = userEvent.setup();
  const createObjectURL = createObjectUrlMock();
  createObjectURL.mockClear();
  seedResults();
  renderWithProviders(<App />, { route: "/export" });

  expect(await screen.findByRole("heading", { name: /Экспорт/i })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Скачать JSON/i }));
  const jsonBlob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
  const jsonPayload = JSON.parse(await readBlobText(jsonBlob));
  expect(jsonPayload.metrics.base_value).toBe(requiredMetrics.base_value);
  expect(jsonPayload.metrics.var_hist).toBe(requiredMetrics.var_hist);
  expect(jsonPayload.metrics.es_hist).toBe(requiredMetrics.es_hist);
  expect(jsonPayload.metrics.variation_margin).toBe(requiredMetrics.variation_margin);
  expect(jsonPayload.data_quality.market_data_completeness).toBe("complete");
  expect(jsonPayload.metrics.valuation_label).toBe("Net PV / MtM");
  expect(jsonPayload.methodology_metadata).toMatchObject({
    limit_source: "manual_user",
    stress_source: "backend_calculated",
    backend_calculated: true,
  });

  await user.click(screen.getByRole("button", { name: /Скачать отчёт \(Excel\)/i }));
  const excelBlob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
  const workbook = XLSX.read(await readBlobArrayBuffer(excelBlob), { type: "array" });
  const metricsSheet = workbook.Sheets.Metrics;
  const metricRows = XLSX.utils.sheet_to_json(metricsSheet, { raw: true }) as Array<Record<string, number>>;
  expect(metricRows[0].base_value).toBe(requiredMetrics.base_value);
  expect(metricRows[0].net_pv_mtm).toBe(requiredMetrics.base_value);
  expect(metricRows[0].valuation_label).toBe("Net PV / MtM");
  expect(metricRows[0].var_hist).toBe(requiredMetrics.var_hist);
  expect(metricRows[0].var_method).toBe("scenario_quantile");
  expect(metricRows[0].es_hist).toBe(requiredMetrics.es_hist);
  expect(metricRows[0].reference_scenario_pnl).toBe(requiredMetrics.variation_margin);
  expect(metricRows[0].variation_margin).toBe(requiredMetrics.variation_margin);
  expect(metricRows[0].calculation_status).toBe("complete");

  const methodologyRows = XLSX.utils.sheet_to_json(workbook.Sheets.Methodology, { header: 1, raw: false }) as string[][];
  const methodology = new Map(methodologyRows.slice(1).map(([key, value]) => [key, value]));
  expect(methodology.get("limit_source")).toBe("manual_user");
  expect(methodology.get("stress_source")).toBe("backend_calculated");
  expect(methodology.get("export_generated_at")).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  const dataQualityRows = XLSX.utils.sheet_to_json(workbook.Sheets.DataQuality, { header: 1, raw: false }) as string[][];
  const dataQuality = new Map(dataQualityRows.slice(1).map(([key, value]) => [key, value]));
  expect(dataQuality.get("market_data_completeness")).toBe("complete");
  expect(dataQuality.get("valuation_label")).toBe("Net PV / MtM");
});

test("stress_sandbox_not_backend_result", async () => {
  const user = userEvent.setup();
  seedResults();
  renderWithProviders(<App />, { route: "/stress" });

  expect(await screen.findByRole("heading", { name: /Стресс-сценарии/i })).toBeInTheDocument();
  expect(screen.getByText(/stress_source=frontend_sandbox_estimate/i)).toBeInTheDocument();
  expect(screen.getByText(/не перезаписывает backend metrics/i)).toBeInTheDocument();

  const before = localStorage.getItem("app_data_v1");
  const scenarioButton = within(document.body).getAllByRole("button").find((button) => button.className.includes("stressCatalogRow"));
  expect(scenarioButton).toBeTruthy();
  await user.click(scenarioButton as HTMLButtonElement);

  const after = localStorage.getItem("app_data_v1");
  expect(after).toBe(before);
});
