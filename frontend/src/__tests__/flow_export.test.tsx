import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { renderWithProviders, runConfiguredCalculation, seedReadyForConfigure } from "./testUtils";

test("экспорт: формирование Excel файла (вызов download)", async () => {
  const user = userEvent.setup();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  await runConfiguredCalculation(user);

  const exportButton = await screen.findByRole("button", { name: /^Экспорт$/i });
  await user.click(exportButton);

  expect(await screen.findByRole("heading", { name: /Шаг 10\. Отчёты и экспорт/i })).toBeInTheDocument();

  const excelBtn = screen.getByRole("button", { name: /Скачать отчёт \(Excel\)/i });
  await user.click(excelBtn);

  expect((URL.createObjectURL as any).mock.calls.length).toBeGreaterThan(0);
});
