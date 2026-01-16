import { screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { renderWithProviders } from "./testUtils";

test("экспорт: формирование Excel файла (вызов download)", async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  await user.click(screen.getByRole("button", { name: /Загрузить демо/i }));
  await user.click(screen.getByRole("button", { name: /Продолжить: проверка данных/i }));
  await user.click(await screen.findByTestId("go-market"));
  await user.click(await screen.findByTestId("fetch-market"));
  const goConfigure = await screen.findByTestId("go-configure");
  await waitFor(() => expect(goConfigure).toBeEnabled());
  await user.click(goConfigure);
  const save = await screen.findByTestId("save-config");
  await waitFor(() => expect(save).toBeEnabled());
  await user.click(save);
  expect(await screen.findByRole("heading", { name: /Шаг 5\. Запуск расчёта/i })).toBeInTheDocument();
  const run = await screen.findByTestId("run-calc");
  await waitFor(() => expect(run).toBeEnabled());
  await user.click(run);

  // дашборд
  expect(await screen.findByRole("heading", { name: /Шаг 6\. Панель риска/i })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^Экспорт$/i }));

  expect(await screen.findByRole("heading", { name: /Шаг 10\. Отчёты и экспорт/i })).toBeInTheDocument();

  const excelBtn = screen.getByRole("button", { name: /Скачать отчёт \(Excel\)/i });
  await user.click(excelBtn);

  expect((URL.createObjectURL as any).mock.calls.length).toBeGreaterThan(0);
});
