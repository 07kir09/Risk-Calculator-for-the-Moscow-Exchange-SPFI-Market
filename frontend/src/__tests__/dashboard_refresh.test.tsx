import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { metricsSchema } from "../api/contracts/metrics";
import { demoMetrics, demoPositions, demoScenarios } from "../mock/demoData";
import { metricsNeedCorrelationRefetch } from "../state/appDataStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { renderWithProviders } from "./testUtils";

function seedDashboardState({
  selectedMetrics,
  metrics,
  limitSource = "draft_auto",
}: {
  selectedMetrics: string[];
  metrics: Record<string, unknown>;
  limitSource?: string;
}) {
  localStorage.setItem(
    "workflow_state_v1",
    JSON.stringify({
      validation: { criticalErrors: 0, warnings: 0, acknowledged: true },
      marketData: { missingFactors: 0, status: "ready" },
      calcConfig: {
        selectedMetrics,
        params: {
          alpha: 0.99,
          horizonDays: 10,
          parametricTailModel: "cornish_fisher",
          baseCurrency: "RUB",
          liquidityModel: "fraction_of_position_value",
        },
        marginEnabled: false,
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
      portfolio: {
        source: "demo",
        importedAt: "2025-01-01T00:00:00.000Z",
        positions: demoPositions,
      },
      validationLog: [],
      scenarios: demoScenarios,
      limits: null,
      limitSource,
      marketDataSummary: {
        session_id: "dashboard-refresh-session",
        files: [
          { filename: "curveDiscount.xlsx", kind: "curve_discount", size_bytes: 1024 },
          { filename: "curveForward.xlsx", kind: "curve_forward", size_bytes: 1024 },
          { filename: "fixing.xlsx", kind: "fixing", size_bytes: 1024 },
        ],
        missing_required_files: [],
        blocking_errors: 0,
        warnings: 0,
        ready: true,
        validation_log: [],
        counts: { discount_curves: 1, forward_curves: 1, fixings: 1, calibration_instruments: 0, fx_history: 0 },
        available_fx_pairs: [],
      },
      marketDataMode: "api_auto",
      results: { metrics },
    })
  );
}

test("metrics schema parses validation_log", () => {
  const parsed = metricsSchema.parse({
    ...demoMetrics,
    validation_log: [
      {
        severity: "WARNING",
        message: "Матрица P&L была усечена для хранения.",
        field: "pnl_matrix",
      },
    ],
  });

  expect(parsed.validation_log).toHaveLength(1);
  expect(parsed.validation_log?.[0]).toMatchObject({
    severity: "WARNING",
    message: "Матрица P&L была усечена для хранения.",
    field: "pnl_matrix",
  });
});

test("dashboard shows draft limit source and methodology warning", async () => {
  seedDashboardState({
    selectedMetrics: ["stress"],
    metrics: {
      ...demoMetrics,
      limit_source: "draft_auto",
    },
  });

  renderWithProviders(<App />, { route: "/dashboard" });

  expect((await screen.findAllByText(/Источник порогов: draft_auto/i)).length).toBeGreaterThan(0);
  expect(await screen.findByText(/Предварительный контроль/i)).toBeInTheDocument();
  expect(screen.getByText(/не являются утверждённой risk-policy/i)).toBeInTheDocument();
});

test("metrics schema is strict and accepts nullable base_value", () => {
  expect(() =>
    metricsSchema.parse({
      ...demoMetrics,
      extra_field: "unexpected",
    } as never)
  ).toThrow();

  expect(metricsSchema.parse({
    ...demoMetrics,
    base_value: null,
  }).base_value).toBeNull();
});

test("stored metrics require refetch when correlations or pnl_matrix are missing", () => {
  const { correlations: _correlations, pnl_matrix: _pnlMatrix, ...restMetrics } = demoMetrics;

  expect(metricsNeedCorrelationRefetch(demoMetrics)).toBe(false);
  expect(metricsNeedCorrelationRefetch({ ...restMetrics, correlations: demoMetrics.correlations, pnl_matrix: undefined })).toBe(true);
  expect(metricsNeedCorrelationRefetch({ ...restMetrics, correlations: undefined, pnl_matrix: demoMetrics.pnl_matrix })).toBe(true);
});

test("dashboard restores correlations after refresh when the stored metrics are incomplete", async () => {
  const { correlations: _correlations, pnl_matrix: _pnlMatrix, ...restMetrics } = demoMetrics;
  const storedMetrics = {
    ...restMetrics,
    validation_log: demoMetrics.validation_log,
  };

  seedDashboardState({ selectedMetrics: ["correlations", "stress"], metrics: storedMetrics });

  renderWithProviders(<App />, { route: "/dashboard" });

  expect(await screen.findByRole("button", { name: /Журнал валидации расчёта/i })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText(/Корреляции не рассчитаны/i)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.queryByText(/Корреляции недоступны/i)).not.toBeInTheDocument());
});

test("dashboard shows an explicit message when correlations cannot be refetched", async () => {
  const { correlations: _correlations, pnl_matrix: _pnlMatrix, ...restMetrics } = demoMetrics;
  const storedMetrics = {
    ...restMetrics,
    validation_log: demoMetrics.validation_log,
  };

  seedDashboardState({ selectedMetrics: [], metrics: storedMetrics });

  renderWithProviders(<App />, { route: "/dashboard" });

  expect(await screen.findByText(/Корреляции недоступны/i)).toBeInTheDocument();
});

test("dashboard hides validation_log disclosure when the log is empty", async () => {
  seedDashboardState({
    selectedMetrics: ["stress"],
    metrics: {
      ...demoMetrics,
      validation_log: [],
    },
  });

  renderWithProviders(<App />, { route: "/dashboard" });

  await screen.findByRole("heading", { name: /Панель риска/i });
  expect(screen.queryByRole("button", { name: /Журнал валидации расчёта/i })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Validation log")).not.toBeInTheDocument();
});

test("dashboard expands and collapses a single validation_log entry", async () => {
  const user = userEvent.setup();
  seedDashboardState({
    selectedMetrics: ["stress"],
    metrics: {
      ...demoMetrics,
      validation_log: [
        {
          severity: "WARNING",
          message: "Entry 1",
          field: "pnl_matrix",
        },
      ],
    },
  });

  renderWithProviders(<App />, { route: "/dashboard" });

  const openButton = await screen.findByRole("button", { name: /Журнал валидации расчёта/i });
  await user.click(openButton);

  const panel = screen.getByLabelText("Validation log");
  expect(within(panel).getByText(/^Entry 1$/)).toBeInTheDocument();
  expect(within(panel).queryByRole("button", { name: /показать все/i })).not.toBeInTheDocument();

  await user.click(openButton);
  await waitFor(() => expect(screen.queryByText(/^Entry 1$/)).not.toBeInTheDocument());
});

test("dashboard truncates and expands validation_log with 100 entries", async () => {
  const user = userEvent.setup();
  seedDashboardState({
    selectedMetrics: ["stress"],
    metrics: {
      ...demoMetrics,
      validation_log: Array.from({ length: 100 }, (_, index) => ({
        severity: index % 2 === 0 ? "WARNING" : "INFO",
        message: `Entry ${index + 1}`,
        field: "pnl_matrix",
      })),
    },
  });

  renderWithProviders(<App />, { route: "/dashboard" });

  const openButton = await screen.findByRole("button", { name: /Журнал валидации расчёта/i });
  await user.click(openButton);

  const panel = screen.getByLabelText("Validation log");
  expect(within(panel).getByText(/^Entry 1$/)).toBeInTheDocument();
  expect(within(panel).queryByText(/^Entry 100$/)).not.toBeInTheDocument();

  const showAllButton = within(panel).getByRole("button", { name: /показать все 100 записей/i });
  await user.click(showAllButton);

  expect(await within(panel).findByText(/^Entry 100$/)).toBeInTheDocument();
});
