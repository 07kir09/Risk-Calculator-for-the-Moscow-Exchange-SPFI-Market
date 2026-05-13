import { bsPrice, historicalVar, historicalEs, parametricVar, parametricEs } from "../lib/math";
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

test("parametric var/es account for horizon and floor at zero", () => {
  const pnls = [-10, 0, 10]; // mu=0, sample sigma=10
  const var95t4 = parametricVar(pnls, 0.95, 4, "normal");
  const es95t4 = parametricEs(pnls, 0.95, 4, "normal");
  expect(var95t4).toBeCloseTo(32.89707253902944, 6);
  expect(es95t4).toBeCloseTo(41.25425615014856, 6);
});

test("weighted historical var differs from unweighted when probabilities are skewed", () => {
  const pnls = [-100, -10, 5];
  const probs = [0.01, 0.94, 0.05];
  const unweighted = historicalVar(pnls, 0.95);
  const weighted = historicalVar(pnls, 0.95, probs);
  expect(unweighted).toBeCloseTo(100, 8);
  expect(weighted).toBeCloseTo(10, 8);
});
