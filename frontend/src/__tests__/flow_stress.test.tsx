import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jest } from "@jest/globals";
import App from "../App";
import client from "../api/client";
import { renderWithProviders, runConfiguredCalculation, seedReadyForConfigure } from "./testUtils";

function storedMetricsSnapshot() {
  const state = JSON.parse(localStorage.getItem("app_data_v1") ?? "{}");
  return JSON.stringify(state.results?.metrics ?? null);
}

test("стресс: запуск → показ топ‑вкладчиков", async () => {
  const user = userEvent.setup();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  await runConfiguredCalculation(user);

  const stressButtons = await screen.findAllByRole("button", { name: /^Стрессы$/i });
  await user.click(stressButtons[0]);

  expect(await screen.findByRole("heading", { name: /Стресс-сценарии/i })).toBeInTheDocument();
  expect(await screen.findByText(/Stress P&L по сценариям/i)).toBeInTheDocument();
  expect(await screen.findByText(/Индикативная оценка портфеля/i)).toBeInTheDocument();
  expect(await screen.findByText(/stress_source=frontend_sandbox_estimate/i)).toBeInTheDocument();
  expect(await screen.findByText(/не перезаписывает backend metrics/i)).toBeInTheDocument();
});

test("stress sandbox changes do not overwrite backend metrics state", async () => {
  const user = userEvent.setup();
  const postSpy = jest.spyOn(client, "post");
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  await runConfiguredCalculation(user);
  const metricsBefore = storedMetricsSnapshot();
  expect(metricsBefore).not.toBe("null");

  const stressButtons = await screen.findAllByRole("button", { name: /^Стрессы$/i });
  await user.click(stressButtons[0]);

  expect(await screen.findByText(/stress_source=frontend_sandbox_estimate/i)).toBeInTheDocument();
  expect(await screen.findByText(/не перезаписывает backend metrics/i)).toBeInTheDocument();
  postSpy.mockClear();

  const scenarioButton =
    Array.from(document.querySelectorAll<HTMLButtonElement>("button.stressCatalogRow")).find(
      (button) => !button.className.includes("stressCatalogRow--selected")
    ) ?? document.querySelector<HTMLButtonElement>("button.stressCatalogRow");
  expect(scenarioButton).toBeTruthy();
  await user.click(scenarioButton as HTMLButtonElement);
  await new Promise((resolve) => setTimeout(resolve, 250));

  expect(storedMetricsSnapshot()).toBe(metricsBefore);
  expect(postSpy.mock.calls.filter(([url]) => String(url).includes("/metrics"))).toHaveLength(0);
  expect(storedMetricsSnapshot()).not.toContain("frontend_sandbox_estimate");
  postSpy.mockRestore();
});
