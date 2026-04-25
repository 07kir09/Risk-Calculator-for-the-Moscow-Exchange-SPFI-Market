import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { demoMetrics, demoPositions } from "../mock/demoData";
import { WorkflowStep } from "../workflow/workflowTypes";
import { renderWithProviders } from "./testUtils";

function seedDashboard(validationLog: NonNullable<typeof demoMetrics.validation_log>) {
  localStorage.setItem(
    "workflow_state_v1",
    JSON.stringify({
      validation: { criticalErrors: 0, warnings: 0, acknowledged: true },
      marketData: { missingFactors: 0, status: "ready" },
      calcConfig: { selectedMetrics: ["var_hist"], params: {}, marginEnabled: false },
      calcRun: { status: "success" },
      completedSteps: [WorkflowStep.Import, WorkflowStep.Validate, WorkflowStep.MarketData, WorkflowStep.Configure, WorkflowStep.Results],
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
      scenarios: [],
      limits: null,
      marketDataSummary: null,
      marketDataMode: "api_auto",
      results: {
        metrics: {
          ...demoMetrics,
          validation_log: validationLog,
        },
        computedAt: "2025-01-01T00:00:00.000Z",
      },
    })
  );
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.setItem("onboarding_seen_v4", "1");
});

test("dashboard не показывает validation_log disclosure при пустом логе", async () => {
  seedDashboard([]);
  renderWithProviders(<App />, { route: "/dashboard" });

  expect(await screen.findByRole("heading", { name: /Панель риска/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Журнал валидации расчёта/i })).not.toBeInTheDocument();
});

test("dashboard раскрывает одну запись validation_log", async () => {
  const user = userEvent.setup();
  seedDashboard([{ severity: "WARNING", field: "curve", message: "Curve warning" }]);
  renderWithProviders(<App />, { route: "/dashboard" });

  const toggle = await screen.findByRole("button", { name: /Журнал валидации расчёта/i });
  await user.click(toggle);

  expect(screen.getByText("WARNING")).toBeInTheDocument();
  expect(screen.getByText("Curve warning")).toBeInTheDocument();
});

test("dashboard truncates 100 validation_log entries and can show all", async () => {
  const user = userEvent.setup();
  const validationLog = Array.from({ length: 100 }, (_, index) => ({
    severity: "INFO" as const,
    row: index + 1,
    field: "row",
    message: `Validation message ${index}`,
  }));
  seedDashboard(validationLog);
  renderWithProviders(<App />, { route: "/dashboard" });

  await user.click(await screen.findByRole("button", { name: /Журнал валидации расчёта/i }));
  const panel = screen.getByLabelText("Validation log");

  expect(within(panel).getByText("Validation message 0")).toBeInTheDocument();
  expect(within(panel).queryByText("Validation message 25")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Показать все 100 записей/i }));
  expect(within(panel).getByText("Validation message 99")).toBeInTheDocument();
});
