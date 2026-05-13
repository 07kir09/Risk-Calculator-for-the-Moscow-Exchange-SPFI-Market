import { parsePortfolioFile, parsePortfolioPaste } from "../lib/portfolioImport";

test("portfolio import routes csv file and paste through the same parser", async () => {
  const csv = [
    "instrument_type,position_id,quantity,notional,underlying_symbol,currency,underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,option_type,style",
    "option,pos_ok,1,1,MOEX,RUB,100,95,0.2,2025-12-31,2025-01-01,0.05,call,european",
  ].join("\n");

  const file = new File([csv], "portfolio.csv", { type: "text/csv" });
  const fromFile = await parsePortfolioFile(file);
  const fromPaste = await parsePortfolioPaste(csv);

  expect(fromFile.positions).toEqual(fromPaste.positions);
  expect(fromFile.log).toEqual(fromPaste.log);
});

test("portfolio paste parser reports an error for invalid content", async () => {
  const result = await parsePortfolioPaste("totally invalid content");

  expect(result.positions).toEqual([]);
  expect(result.log.some((entry) => entry.severity === "ERROR")).toBe(true);
});
