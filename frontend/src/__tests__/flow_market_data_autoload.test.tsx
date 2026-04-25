import { screen } from "@testing-library/react";
import App from "../App";
import { renderWithProviders } from "./testUtils";
import { demoPositions } from "../mock/demoData";
import { WorkflowStep } from "../workflow/workflowTypes";

test("рыночные данные открываются в API auto режиме при готовом портфеле", async () => {
  localStorage.setItem(
    "workflow_state_v1",
    JSON.stringify({
      validation: { criticalErrors: 0, warnings: 0, acknowledged: true },
      marketData: { missingFactors: 0, status: "idle" },
      calcConfig: { selectedMetrics: [], params: {}, marginEnabled: false },
      calcRun: { status: "idle" },
      completedSteps: [WorkflowStep.Import, WorkflowStep.Validate],
    })
  );

  localStorage.setItem(
    "app_data_v1",
    JSON.stringify({
      portfolio: {
        source: "csv",
        importedAt: "2025-01-01T00:00:00.000Z",
        filename: "portfolio_large_1000.xlsx",
        positions: demoPositions,
      },
      validationLog: [],
      scenarios: [],
      limits: null,
      marketDataSummary: null,
      results: { metrics: null },
    })
  );

  renderWithProviders(<App />, { route: "/market" });

  expect(await screen.findByRole("heading", { name: /Рыночные данные/i })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /Обновить из ЦБ\/MOEX/i })).toBeInTheDocument();
  expect(await screen.findByText(/Live API-режим/i)).toBeInTheDocument();
  expect(await screen.findByText(/Профиль портфеля для market data/i)).toBeInTheDocument();
  expect(await screen.findByText(/option: 1 · forward: 1/i)).toBeInTheDocument();
});
