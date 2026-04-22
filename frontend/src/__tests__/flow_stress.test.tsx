import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { renderWithProviders, runConfiguredCalculation, seedReadyForConfigure } from "./testUtils";

test("стресс: запуск → показ топ‑вкладчиков", async () => {
  const user = userEvent.setup();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  await runConfiguredCalculation(user);

  const stressButtons = await screen.findAllByRole("button", { name: /^Стрессы$/i });
  await user.click(stressButtons[0]);

  expect(await screen.findByRole("heading", { name: /Стресс-сценарии/i })).toBeInTheDocument();
  expect(await screen.findByText(/Stress P&L по сценариям/i)).toBeInTheDocument();
  expect(await screen.findByText(/Влияние сценария на портфель/i)).toBeInTheDocument();
});
