import { screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { renderWithProviders, seedReadyForConfigure } from "./testUtils";

test("стресс: запуск → показ топ‑вкладчиков", async () => {
  const user = userEvent.setup();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  expect(await screen.findByRole("heading", { name: /Настройка расчёта/i })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: /Сохранить и перейти к запуску/i })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: /Сохранить и перейти к запуску/i }));

  // After run → dashboard. Find and click the Стрессы tab.
  expect(await screen.findByRole("heading", { name: /Панель риска/i })).toBeInTheDocument();

  const stressTab = await screen.findByRole("tab", { name: /Стрессы/i });
  await user.click(stressTab);

  expect(await screen.findByText(/Форма стресс-профиля/i)).toBeInTheDocument();
});
