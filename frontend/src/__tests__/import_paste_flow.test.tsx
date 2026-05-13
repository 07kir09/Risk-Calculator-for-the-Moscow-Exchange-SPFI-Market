import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { demoPositions } from "../mock/demoData";
import { renderWithProviders } from "./testUtils";

const VALID_CSV = [
  "instrument_type,position_id,quantity,notional,underlying_symbol,currency,underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,option_type,style",
  "option,pos_paste,1,1,MOEX,RUB,100,95,0.2,2025-12-31,2025-01-01,0.05,call,european",
].join("\n");

test("paste flow imports valid portfolio text and shows Paste label", async () => {
  localStorage.clear();
  localStorage.setItem("onboarding_seen_v4", "1");
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  await user.type(screen.getByTestId("portfolio-paste"), VALID_CSV);
  await user.click(screen.getByRole("button", { name: /импортировать вставку/i }));

  expect(await screen.findByText(/Позиции считаны: 1/i)).toBeInTheDocument();
  expect(screen.getByText(/^Paste$/)).toBeInTheDocument();
});

test("paste flow shows inline error for empty text", async () => {
  localStorage.clear();
  localStorage.setItem("onboarding_seen_v4", "1");
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  await user.click(screen.getByRole("button", { name: /импортировать вставку/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/вставка пуста|скопируйте строку заголовков/i);
});

test("paste flow shows inline error for invalid text without clearing current portfolio", async () => {
  localStorage.clear();
  localStorage.setItem("onboarding_seen_v4", "1");
  localStorage.setItem(
    "app_data_v1",
    JSON.stringify({
      portfolio: {
        source: "csv",
        importedAt: "2025-01-01T00:00:00.000Z",
        filename: "portfolio.csv",
        positions: [demoPositions[0]],
      },
      validationLog: [],
      scenarios: [],
      limits: null,
      marketDataSummary: null,
      marketDataMode: "api_auto",
      results: { metrics: null },
    })
  );

  const user = userEvent.setup();
  renderWithProviders(<App />, { route: "/import" });

  expect(await screen.findByText(/Позиции считаны: 1/i)).toBeInTheDocument();
  await user.type(screen.getByTestId("portfolio-paste"), "totally invalid content");
  await user.click(screen.getByRole("button", { name: /импортировать вставку/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/не удалось импортировать|не содержит строк данных|ошибка csv/i);
  await waitFor(() => expect(screen.getByText(/Позиции считаны: 1/i)).toBeInTheDocument());
});
