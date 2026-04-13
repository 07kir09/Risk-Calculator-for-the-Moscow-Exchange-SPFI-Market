import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { renderWithProviders, runConfiguredCalculation, seedReadyForConfigure } from "./testUtils";

test("демо: настройка → запуск → дашборд", async () => {
  const user = userEvent.setup();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  await runConfiguredCalculation(user);
  expect(await screen.findByRole("button", { name: /^Экспорт$/i })).toBeInTheDocument();
});
