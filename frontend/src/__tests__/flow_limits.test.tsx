import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { demoMetrics, demoPositions, demoScenarios } from "../mock/demoData";
import { WorkflowStep } from "../workflow/workflowTypes";
import { renderWithProviders } from "./testUtils";

function seedLimitsState() {
  localStorage.setItem(
    "workflow_state_v1",
    JSON.stringify({
      validation: { criticalErrors: 0, warnings: 0, acknowledged: true },
      marketData: { missingFactors: 0, status: "ready" },
      calcConfig: { selectedMetrics: ["stress"], params: { baseCurrency: "RUB" }, marginEnabled: true },
      calcRun: { status: "success" },
      completedSteps: [WorkflowStep.Import, WorkflowStep.Validate, WorkflowStep.MarketData, WorkflowStep.Configure, WorkflowStep.Results],
    })
  );
  localStorage.setItem(
    "app_data_v1",
    JSON.stringify({
      portfolio: { source: "demo", importedAt: "2025-01-01T00:00:00.000Z", positions: demoPositions },
      validationLog: [],
      scenarios: demoScenarios,
      limits: null,
      limitSource: "draft_auto",
      marketDataSummary: null,
      marketDataMode: "api_auto",
      results: { metrics: { ...demoMetrics, methodology_note: null, limit_source: "draft_auto" } },
    })
  );
}

test("limits page marks auto thresholds as draft and manual as user-defined", async () => {
  const user = userEvent.setup();
  seedLimitsState();
  renderWithProviders(<App />, { route: "/limits" });

  expect(await screen.findByRole("heading", { name: /Контрольные пороги риска/i })).toBeInTheDocument();
  expect(screen.getByText(/Источник: draft_auto/i)).toBeInTheDocument();
  expect(screen.getAllByText(/не утверждённая risk-policy/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/предварительного контроля/i).length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: /^Ручные$/i }));
  await user.clear(screen.getByLabelText(/Scenario VaR/i));
  await user.type(screen.getByLabelText(/Scenario VaR/i), "20000");
  await user.clear(screen.getByLabelText(/Scenario ES/i));
  await user.type(screen.getByLabelText(/Scenario ES/i), "25000");
  await user.clear(screen.getByLabelText(/LC VaR/i));
  await user.type(screen.getByLabelText(/LC VaR/i), "30000");
  await user.click(screen.getByRole("button", { name: /Применить ручные пороги/i }));

  expect(await screen.findByText(/Источник: manual_user/i)).toBeInTheDocument();
  expect(screen.getAllByText(/пользовательские пороги/i).length).toBeGreaterThan(0);
});

test("manual approved source requires explicit confirmation and propagates to dashboard/export", async () => {
  const user = userEvent.setup();
  seedLimitsState();
  const view = renderWithProviders(<App />, { route: "/limits" });

  expect(await screen.findByRole("heading", { name: /Контрольные пороги риска/i })).toBeInTheDocument();
  expect(screen.getByText(/Источник: draft_auto/i)).toBeInTheDocument();
  expect(screen.queryByText(/Источник: manual_approved/i)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /^Ручные$/i }));
  await user.clear(screen.getByLabelText(/Scenario VaR/i));
  await user.type(screen.getByLabelText(/Scenario VaR/i), "20000");
  await user.clear(screen.getByLabelText(/Scenario ES/i));
  await user.type(screen.getByLabelText(/Scenario ES/i), "25000");
  await user.clear(screen.getByLabelText(/LC VaR/i));
  await user.type(screen.getByLabelText(/LC VaR/i), "30000");
  await user.click(screen.getByRole("button", { name: /Применить ручные пороги/i }));

  expect(await screen.findByText(/Источник: manual_user/i)).toBeInTheDocument();
  expect(screen.queryByText(/Источник: manual_approved/i)).not.toBeInTheDocument();

  await user.click(screen.getByLabelText(/подтверждаю.*утверждённой risk-policy/i));
  await user.click(screen.getByRole("button", { name: /Применить ручные пороги/i }));

  expect(await screen.findByText(/Источник: manual_approved/i)).toBeInTheDocument();
  expect(screen.getAllByText(/утверждённая risk-policy/i).length).toBeGreaterThan(0);
  const state = JSON.parse(localStorage.getItem("app_data_v1") ?? "{}");
  expect(state.limitSource).toBe("manual_approved");
  expect(state.results.metrics.limit_source).toBe("manual_approved");
  expect(state.results.metrics.methodology_metadata).toMatchObject({
    methodology_status: "approved",
    limit_source: "manual_approved",
    preliminary: false,
    draft_policy_note: null,
  });

  view.unmount();
  const dashboardView = renderWithProviders(<App />, { route: "/dashboard" });
  expect((await screen.findAllByText(/Источник порогов: manual_approved/i)).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Предварительный контроль/i)).not.toBeInTheDocument();

  dashboardView.unmount();
  renderWithProviders(<App />, { route: "/export" });
  expect(await screen.findByText(/Источник порогов: manual_approved/i)).toBeInTheDocument();
  expect(screen.getByText(/methodology_status: approved/i)).toBeInTheDocument();
});
