import { PositionDTO } from "../api/types";
import { MetricsResponse, ScenarioDTO } from "../api/contracts/metrics";

export const demoPositions: PositionDTO[] = [
  {
    instrument_type: "option",
    position_id: "call_eu",
    option_type: "call",
    style: "european",
    quantity: 10,
    notional: 1,
    underlying_symbol: "MOEX",
    underlying_price: 100,
    strike: 95,
    volatility: 0.2,
    maturity_date: "2025-12-31",
    valuation_date: "2025-01-01",
    risk_free_rate: 0.06,
    dividend_yield: 0.01,
    currency: "RUB",
    liquidity_haircut: 0.1,
    model: "black_scholes",
  },
  {
    instrument_type: "forward",
    position_id: "fwd_fx",
    option_type: "call",
    style: "european",
    quantity: 3,
    notional: 100000,
    underlying_symbol: "USDRUB",
    underlying_price: 92,
    strike: 90,
    volatility: 0.01,
    maturity_date: "2025-06-30",
    valuation_date: "2025-01-01",
    risk_free_rate: 0.045,
    currency: "RUB",
    liquidity_haircut: 0.0,
  },
];

export const demoScenarios: ScenarioDTO[] = [
  { scenario_id: "mild_down", underlying_shift: -0.02, volatility_shift: 0.01, rate_shift: 0, description: "Спот -2%, вола +1%" },
  { scenario_id: "base", underlying_shift: 0, volatility_shift: 0, rate_shift: 0, description: "Базовый" },
  { scenario_id: "shock_down", underlying_shift: -0.1, volatility_shift: 0.05, rate_shift: -0.005, description: "Шок 10%" },
];

export const demoMetrics: MetricsResponse = {
  base_value: 123456.78,
  var_hist: 10000,
  es_hist: 12000,
  var_param: 15000,
  es_param: 18000,
  lc_var: 10500,
  greeks: { delta: 12.3, gamma: 0.12, vega: 100.5, theta: -20.1, rho: 50.2, dv01: 999.1 },
  stress: [
    { scenario_id: "mild_down", pnl: -500, limit: 9000, breached: false },
    { scenario_id: "shock_down", pnl: -12000, limit: 9000, breached: true },
  ],
  limits: [["var_hist", 10000, 9000, true]],
  buckets: { RUB: { notional: 100000, quantity: 13, delta: 12.3 } },
  capital: 12000,
  initial_margin: 10500,
  variation_margin: -500,
};
