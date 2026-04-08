import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { WorkflowProvider } from "../workflow/workflowStore";
import { AppDataProvider } from "../state/appDataStore";
import { demoPositions } from "../mock/demoData";
import { WorkflowStep } from "../workflow/workflowTypes";

export function renderWithProviders(ui: ReactElement, opts?: { route?: string }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const route = opts?.route ?? "/";
  return render(
    <QueryClientProvider client={client}>
      <WorkflowProvider>
        <AppDataProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </AppDataProvider>
      </WorkflowProvider>
    </QueryClientProvider>
  );
}

export function seedReadyForConfigure() {
  localStorage.setItem(
    "workflow_state_v1",
    JSON.stringify({
      validation: { criticalErrors: 0, warnings: 0, acknowledged: true },
      marketData: { missingFactors: 0, status: "ready" },
      calcConfig: { selectedMetrics: [], params: {}, marginEnabled: false },
      calcRun: { status: "idle" },
      completedSteps: [WorkflowStep.Import, WorkflowStep.Validate, WorkflowStep.MarketData],
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
      marketDataSummary: {
        session_id: "demo-market-session",
        files: [
          { filename: "curveDiscount.xlsx", kind: "curve_discount", size_bytes: 1024 },
          { filename: "curveForward.xlsx", kind: "curve_forward", size_bytes: 1024 },
          { filename: "fixing.xlsx", kind: "fixing", size_bytes: 1024 },
          { filename: "calibrationInstrument.xlsx", kind: "calibration", size_bytes: 1024 },
          { filename: "RC_USDRUB.xlsx", kind: "fx_history", size_bytes: 1024 },
        ],
        missing_required_files: [],
        blocking_errors: 0,
        warnings: 0,
        ready: true,
        validation_log: [],
        counts: {
          discount_curves: 1,
          forward_curves: 1,
          fixings: 1,
          calibration_instruments: 1,
          fx_history: 1,
        },
      },
      results: { metrics: null },
    })
  );
}
