import { bsPrice, historicalVar, historicalEs } from "../lib/math";
import { OptionPosition } from "../types";

test("bs price matches reference", () => {
  const p: OptionPosition = {
    position_id: "t",
    option_type: "call",
    style: "european",
    quantity: 1,
    underlying_symbol: "T",
    currency: "RUB",
    underlying_price: 100,
    strike: 100,
    volatility: 0.2,
    maturity_date: "2026-01-01",
    valuation_date: "2025-01-01",
    risk_free_rate: 0.05,
    dividend_yield: 0,
    liquidity_haircut: 0,
  };
  const price = bsPrice(p);
  expect(price).toBeCloseTo(10.45, 1);
});

test("var/es monotonic", () => {
  const pnls = [-1000, 200, -300, 500, -50, 120];
  const var99 = historicalVar(pnls, 0.99);
  const es99 = historicalEs(pnls, 0.99);
  expect(es99).toBeGreaterThanOrEqual(var99);
});
