import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  await screen.findByText(/Загружено позиций: 1/i);
  const continueBtn = screen.getByRole("button", { name: /продолжить: проверка данных/i });
  expect(continueBtn).toBeEnabled();

  await user.click(continueBtn);

  await screen.findByRole("heading", { name: /Шаг 2\. Проверка данных/i });
  expect(screen.getByText(/Критических ошибок:/i)).toBeInTheDocument();

  const downloadBtn = screen.getByTestId("download-validation-log");
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

  await screen.findByText(/Загружено позиций: 1/i);
  const continueBtn = screen.getByRole("button", { name: /продолжить: проверка данных/i });
  expect(continueBtn).toBeEnabled();
});
