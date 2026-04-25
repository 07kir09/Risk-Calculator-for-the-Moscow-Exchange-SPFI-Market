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
  lc_var_addon: 500,
  lc_var_breakdown: [
    {
      position_id: "call_eu",
      model: "fraction_of_position_value",
      quantity: 10,
      position_value: 10000,
      haircut_input: 0.03,
      add_on_money: 300,
    },
    {
      position_id: "fwd_fx",
      model: "fraction_of_position_value",
      quantity: 3,
      position_value: 10000,
      haircut_input: 0.02,
      add_on_money: 200,
    },
  ],
  greeks: { delta: 12.3, gamma: 0.12, vega: 100.5, theta: -20.1, rho: 50.2, dv01: 999.1 },
  stress: [
    { scenario_id: "mild_down", pnl: -500, limit: 9000, breached: false },
    { scenario_id: "shock_down", pnl: -12000, limit: 9000, breached: true },
  ],
  top_contributors: {
    var_hist: [
      { metric: "var_hist", position_id: "call_eu", scenario_id: "shock_down", pnl_contribution: -7000, abs_pnl_contribution: 7000 },
      { metric: "var_hist", position_id: "fwd_fx", scenario_id: "shock_down", pnl_contribution: -3000, abs_pnl_contribution: 3000 },
    ],
    es_hist: [
      { metric: "es_hist", position_id: "call_eu", scenario_id: "tail_mean", pnl_contribution: -6500, abs_pnl_contribution: 6500 },
      { metric: "es_hist", position_id: "fwd_fx", scenario_id: "tail_mean", pnl_contribution: -2800, abs_pnl_contribution: 2800 },
    ],
    stress: [
      { metric: "stress", position_id: "call_eu", scenario_id: "shock_down", pnl_contribution: -7000, abs_pnl_contribution: 7000 },
      { metric: "stress", position_id: "fwd_fx", scenario_id: "shock_down", pnl_contribution: -3000, abs_pnl_contribution: 3000 },
    ],
  },
  limits: [["var_hist", 10000, 9000, true]],
  correlations: [
    [1, 0.34],
    [0.34, 1],
  ],
  pnl_matrix: [
    [1, 0.34],
    [0.34, 1],
  ],
  validation_log: [
    {
      severity: "WARNING",
      message: "Для части сценариев P&L построен с пониженной детализацией.",
      field: "pnl_matrix",
    },
  ],
  buckets: { RUB: { notional: 100000, quantity: 13, delta: 12.3 } },
  base_currency: "RUB",
  confidence_level: 0.99,
  horizon_days: 10,
  mode: "demo",
  methodology_note: "Historical VaR/ES рассчитаны на демонстрационных сценариях.",
  liquidity_model: "fraction_of_position_value",
  capital: 12000,
  initial_margin: 10500,
  variation_margin: -500,
  calculation_status: "complete",
  data_quality: {
    market_data_completeness: "complete",
    missing_curves: [],
    missing_fx: [],
    affected_positions: [],
    partial_positions_count: 0,
    warnings: [],
  },
  market_data_completeness: "complete",
  market_data_source: "demo_default",
  methodology_status: "preliminary",
  valuation_label: "Net PV / MtM",
  var_method: "scenario_quantile",
};
