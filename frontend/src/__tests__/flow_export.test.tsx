import { screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { renderWithProviders, seedReadyForConfigure } from "./testUtils";

test("экспорт: формирование Excel файла (вызов download)", async () => {
  const user = userEvent.setup();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  expect(await screen.findByRole("heading", { name: /Настройка расчёта/i })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: /Сохранить и перейти к запуску/i })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: /Сохранить и перейти к запуску/i }));

  const exportLink = await screen.findByRole("link", { name: /^Экспорт$/i }, { timeout: 3000 });
  await user.click(exportLink);

  expect(await screen.findByRole("heading", { name: /Шаг 10\. Отчёты и экспорт/i })).toBeInTheDocument();

  const excelBtn = screen.getByRole("button", { name: /Скачать отчёт \(Excel\)/i });
  await user.click(excelBtn);

  expect((URL.createObjectURL as any).mock.calls.length).toBeGreaterThan(0);
});
