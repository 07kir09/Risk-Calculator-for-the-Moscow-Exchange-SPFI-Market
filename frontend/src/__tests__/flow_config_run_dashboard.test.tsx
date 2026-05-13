import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { demoPositions } from "../mock/demoData";
import { WorkflowStep } from "../workflow/workflowTypes";
import { renderWithProviders, runConfiguredCalculation, seedReadyForConfigure } from "./testUtils";

function seedConfigureWithCurrencies(
  currencies: string[],
  availableFxPairs: string[] = [],
  marketDataMode: "api_auto" | "manual_bundle" = "manual_bundle"
) {
  localStorage.setItem(
    "workflow_state_v1",
    JSON.stringify({
      validation: { criticalErrors: 0, warnings: 0, acknowledged: true },
      marketData: { missingFactors: 0, status: "ready" },
      calcConfig: { selectedMetrics: [], params: { baseCurrency: "RUB" }, marginEnabled: false },
      calcRun: { status: "idle" },
      completedSteps: [WorkflowStep.Import, WorkflowStep.Validate, WorkflowStep.MarketData],
    })
  );
  localStorage.setItem(
    "app_data_v1",
    JSON.stringify({
      portfolio: {
        source: "csv",
        importedAt: "2025-01-01T00:00:00.000Z",
        positions: currencies.map((currency, index) => ({ ...demoPositions[1], position_id: `fx_${currency}_${index}`, currency })),
      },
      validationLog: [],
      scenarios: [],
      limits: null,
      limitSource: "draft_auto",
      marketDataSummary: {
        session_id: "fx-session",
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
        counts: {
          discount_curves: 1,
          forward_curves: 1,
          fixings: 1,
          calibration_instruments: 0,
          fx_history: availableFxPairs.length,
        },
        available_fx_pairs: availableFxPairs,
      },
      marketDataMode,
      results: { metrics: null },
    })
  );
}

test("демо: настройка → запуск → дашборд", async () => {
  const user = userEvent.setup();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  await runConfiguredCalculation(user);
  expect(await screen.findByRole("button", { name: /^Экспорт$/i })).toBeInTheDocument();
});

test("configure blocks calculation until required FX rate is entered", async () => {
  const user = userEvent.setup();
  seedConfigureWithCurrencies(["USD", "EUR"]);

  renderWithProviders(<App />, { route: "/configure" });

  const goToResultsButton = await screen.findByRole("button", { name: /Перейти к результатам/i });
  expect(await screen.findByText(/Нужны FX: EUR\/RUB, USD\/RUB/i)).toBeInTheDocument();
  expect(goToResultsButton).toBeDisabled();

  await user.click(screen.getByText(/FX rates и продвинутые настройки/i));
  expect(await screen.findByText(/Для текущего портфеля нужно задать EUR\/RUB, USD\/RUB/i)).toBeInTheDocument();
  expect(await screen.findByText(/загрузите RC_\*\.xlsx/i)).toBeInTheDocument();
  const fxInput = await screen.findByLabelText(/FX rates \(JSON, требуется для валют не в базовой валюте\)/i);
  fireEvent.change(fxInput, { target: { value: '{"USD": 92, "EUR": 100}' } });

  expect(await screen.findByRole("button", { name: /Перейти к результатам/i })).toBeEnabled();
});

test("configure uses FX pairs advertised by market-data session", async () => {
  seedConfigureWithCurrencies(["USD", "EUR"], ["USD/RUB", "EUR/RUB"]);

  renderWithProviders(<App />, { route: "/configure" });

  expect(await screen.findByRole("button", { name: /Перейти к результатам/i })).toBeEnabled();
  expect(screen.queryByText(/Нужны FX:/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByText(/FX rates и продвинутые настройки/i));
  expect(await screen.findByText(/Доступные FX из market-data: USD\/RUB, EUR\/RUB/i)).toBeInTheDocument();
});

test("configure blocks API auto until live session advertises required FX", async () => {
  seedConfigureWithCurrencies(["USD", "EUR"], [], "api_auto");

  renderWithProviders(<App />, { route: "/configure" });

  expect(await screen.findByRole("button", { name: /Перейти к результатам/i })).toBeDisabled();
  expect(await screen.findByText(/Нужны FX: EUR\/RUB, USD\/RUB/i)).toBeInTheDocument();
  expect(screen.queryByText(/FX проверит backend/i)).not.toBeInTheDocument();

  await userEvent.click(screen.getByText(/FX rates и продвинутые настройки/i));
  expect(await screen.findByText(/В live market-data нет подтверждённых EUR\/RUB, USD\/RUB/i)).toBeInTheDocument();
  expect(await screen.findByText(/Обновите live market-data из ЦБ\/MOEX/i)).toBeInTheDocument();
});
