import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import App from "../App";
import { renderWithProviders } from "./testUtils";

test("импорт CSV → показ ошибок → скачивание лога", async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  const csv = [
    "instrument_type,position_id,quantity,notional,underlying_symbol,currency,underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,option_type,style",
    // валидная строка
    "option,pos_ok,1,1,MOEX,RUB,100,95,0.2,2025-12-31,2025-01-01,0.05,call,european",
    // невалидная строка: quantity=0
    "option,pos_bad,0,1,MOEX,RUB,100,95,0.2,2025-12-31,2025-01-01,0.05,call,european",
  ].join("\n");

  const file = new File([csv], "portfolio.csv", { type: "text/csv" });
  const input = screen.getByTestId("portfolio-file") as HTMLInputElement;

  await user.upload(input, file);

  await screen.findByRole("heading", { name: /Проверка данных/i });

  const downloadBtn = screen.getByRole("button", { name: /скачать лог/i });
  expect(downloadBtn).toBeEnabled();
  await user.click(downloadBtn);
});

test("импорт Excel на главной странице работает так же, как CSV", async () => {
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  const rows = [
    [
      "instrument_type",
      "position_id",
      "quantity",
      "notional",
      "underlying_symbol",
      "currency",
      "underlying_price",
      "strike",
      "volatility",
      "maturity_date",
      "valuation_date",
      "risk_free_rate",
      "option_type",
      "style",
    ],
    ["option", "pos_xlsx", 1, 1, "MOEX", "RUB", 100, 95, 0.2, "2025-12-31", "2025-01-01", 0.05, "call", "european"],
  ];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Portfolio");
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const file = new File([out], "portfolio.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const input = screen.getByTestId("portfolio-file") as HTMLInputElement;
  await user.upload(input, file);

  await screen.findByText(/Позиции считаны: 1/i);
  expect(screen.getByText("XLSX")).toBeInTheDocument();
  const continueBtn = screen.getByRole("button", { name: /к рыночным данным/i });
  expect(continueBtn).toBeEnabled();
});

test("валидная вставка импортирует портфель с source label Paste", async () => {
  cleanup();
  localStorage.clear();
  localStorage.setItem("onboarding_seen_v4", "1");
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  const csv = [
    "instrument_type,position_id,quantity,notional,underlying_symbol,currency,underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,option_type,style",
    "option,pos_paste,1,1,MOEX,RUB,100,95,0.2,2025-12-31,2025-01-01,0.05,call,european",
  ].join("\n");

  fireEvent.change(screen.getByLabelText(/вставить портфель как текст/i), { target: { value: csv } });
  await user.click(screen.getByRole("button", { name: /импортировать вставку/i }));

  await screen.findByText(/Позиции считаны: 1/i);
  expect(screen.getByText("Paste")).toBeInTheDocument();
});

test("невалидная вставка показывает inline error и не падает", async () => {
  cleanup();
  localStorage.clear();
  localStorage.setItem("onboarding_seen_v4", "1");
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  fireEvent.change(screen.getByLabelText(/вставить портфель как текст/i), { target: { value: "foo\nbar" } });
  await user.click(screen.getByRole("button", { name: /импортировать вставку/i }));

  expect(await screen.findByRole("alert", { name: /лог вставки портфеля/i })).toBeInTheDocument();
  expect(screen.getByText(/instrument_type/i)).toBeInTheDocument();
  expect(screen.queryByText("Paste")).not.toBeInTheDocument();
});

test.each([
  { filename: "sample_portfolio.xlsx", expectedPositions: 7 },
  { filename: "sample_portfolio_full.xlsx", expectedPositions: 18 },
])("публичный шаблон %s импортируется без критических ошибок", async ({ filename, expectedPositions }) => {
  cleanup();
  localStorage.clear();
  localStorage.setItem("onboarding_seen_v4", "1");
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  const input = screen.getByTestId("portfolio-file") as HTMLInputElement;
  const filePath = path.resolve(process.cwd(), "public", filename);
  const bytes = new Uint8Array(readFileSync(filePath));
  const file = new File([bytes], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  await user.upload(input, file);

  await waitFor(() => {
    const text = document.body.textContent ?? "";
    expect(text).toContain(`Позиции считаны: ${expectedPositions}`);
  });

  const text = document.body.textContent ?? "";
  expect(text).toContain("Критических ошибок: 0");
  expect(text).toContain("Предупреждений: 0");
});
