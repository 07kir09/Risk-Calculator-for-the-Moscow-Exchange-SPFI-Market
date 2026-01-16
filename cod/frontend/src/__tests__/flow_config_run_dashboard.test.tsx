import { screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { renderWithProviders } from "./testUtils";

test("демо: импорт → проверка → рыночные данные → настройки → запуск → дашборд", async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  await user.click(screen.getByRole("button", { name: /Загрузить демо/i }));
  expect(await screen.findByText(/Загружено позиций: 2/i)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Продолжить: проверка данных/i }));
  expect(await screen.findByRole("heading", { name: /Шаг 2\. Проверка данных/i })).toBeInTheDocument();

  await user.click(screen.getByTestId("go-market"));
  expect(await screen.findByRole("heading", { name: /Шаг 3\. Связь с рыночными данными/i })).toBeInTheDocument();

  await user.click(screen.getByTestId("fetch-market"));
  const goConfigure = await screen.findByTestId("go-configure");
  await waitFor(() => expect(goConfigure).toBeEnabled());
  await user.click(goConfigure);
  expect(await screen.findByRole("heading", { name: /Шаг 4\. Настройка расчёта/i })).toBeInTheDocument();

  const save = screen.getByTestId("save-config");
  await waitFor(() => expect(save).toBeEnabled());
  await user.click(save);
  expect(await screen.findByRole("heading", { name: /Шаг 5\. Запуск расчёта/i })).toBeInTheDocument();

  const run = screen.getByTestId("run-calc");
  await waitFor(() => expect(run).toBeEnabled());
  await user.click(run);
  expect(await screen.findByRole("heading", { name: /Шаг 6\. Панель риска/i })).toBeInTheDocument();
});
