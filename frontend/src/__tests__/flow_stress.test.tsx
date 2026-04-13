import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { renderWithProviders, runConfiguredCalculation, seedReadyForConfigure } from "./testUtils";

test("стресс: запуск → показ топ‑вкладчиков", async () => {
  const user = userEvent.setup();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  await runConfiguredCalculation(user);

  await user.click(await screen.findByRole("button", { name: /^Стрессы$/i }));

  expect(await screen.findByRole("heading", { name: /Стресс-сценарии/i })).toBeInTheDocument();

  expect(await screen.findByText(/Драйверы stress/i)).toBeInTheDocument();
});
