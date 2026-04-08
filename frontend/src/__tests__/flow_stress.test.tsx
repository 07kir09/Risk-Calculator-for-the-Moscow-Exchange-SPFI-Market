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
  expect(await screen.findByRole("heading", { name: /Запуск расчёта/i })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: /Запустить расчёт/i })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: /Запустить расчёт/i }));

  await user.click(await screen.findByRole("link", { name: /Стресс/i }));

  expect(await screen.findByRole("heading", { name: /Стресс-сценарии/i })).toBeInTheDocument();

  expect(await screen.findByText(/Драйверы stress/i)).toBeInTheDocument();
});
