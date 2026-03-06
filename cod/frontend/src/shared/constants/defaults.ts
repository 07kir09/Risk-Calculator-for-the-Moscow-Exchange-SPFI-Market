import { MetricsResponse, PositionDraft, RunConfigDraft, ScenarioDraft } from "../types/contracts";

export const defaultPositions: PositionDraft[] = [
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
    maturity_date: "2026-12-31",
    valuation_date: "2026-01-01",
    risk_free_rate: 0.06,
    dividend_yield: 0.01,
    currency: "RUB",
    liquidity_haircut: 0.1,
    model: "black_scholes",
  },
  {
    instrument_type: "forward",
    position_id: "fwd_fx",
    quantity: 3,
    notional: 100000,
    underlying_symbol: "USDRUB",
    underlying_price: 92,
    strike: 90,
    volatility: 0,
    maturity_date: "2026-09-30",
    valuation_date: "2026-01-01",
    risk_free_rate: 0.045,
    dividend_yield: 0,
    currency: "RUB",
    liquidity_haircut: 0,
  },
];

export const defaultScenarios: ScenarioDraft[] = [
  { scenario_id: "mild_down", underlying_shift: -0.02, volatility_shift: 0.01, rate_shift: 0 },
  { scenario_id: "base", underlying_shift: 0, volatility_shift: 0, rate_shift: 0 },
  { scenario_id: "mild_up", underlying_shift: 0.02, volatility_shift: -0.01, rate_shift: 0 },
  { scenario_id: "shock_down", underlying_shift: -0.1, volatility_shift: 0.05, rate_shift: -0.005 },
  { scenario_id: "shock_up", underlying_shift: 0.1, volatility_shift: -0.05, rate_shift: 0.005 },
];

export const defaultLimits: Record<string, any> = {
  var_hist: 5000,
  es_hist: 7000,
  var_param: 5000,
  es_param: 7000,
  lc_var: 8000,
  stress: {
    shock_down: 9000,
    shock_up: 9000,
  },
};

export const defaultRunConfig: RunConfigDraft = {
  alpha: 0.99,
  horizon_days: 10,
  parametric_tail_model: "normal",
  base_currency: "RUB",
  fx_rates: null,
  liquidity_model: "fraction_of_position_value",
  mode: "api",
  calc_sensitivities: true,
  calc_var_es: true,
  calc_stress: true,
  calc_margin_capital: true,
  calc_correlations: true,
};

export const emptyMetricsResult: MetricsResponse | null = null;

export const positionColumns: Array<keyof PositionDraft | "actions"> = [
  "position_id",
  "instrument_type",
  "underlying_symbol",
  "option_type",
  "style",
  "quantity",
  "notional",
  "underlying_price",
  "strike",
  "volatility",
  "maturity_date",
  "valuation_date",
  "risk_free_rate",
  "dividend_yield",
  "currency",
  "liquidity_haircut",
  "model",
  "fixed_rate",
  "float_rate",
  "day_count",
  "actions",
];

export const scenarioPresets: ScenarioDraft[] = [
  { scenario_id: "Base", underlying_shift: 0, volatility_shift: 0, rate_shift: 0 },
  { scenario_id: "Mild Down", underlying_shift: -0.02, volatility_shift: 0.01, rate_shift: 0 },
  { scenario_id: "Mild Up", underlying_shift: 0.02, volatility_shift: -0.01, rate_shift: 0 },
  { scenario_id: "Shock Down", underlying_shift: -0.1, volatility_shift: 0.05, rate_shift: -0.005 },
  { scenario_id: "Shock Up", underlying_shift: 0.1, volatility_shift: -0.05, rate_shift: 0.005 },
];

export const uploadMappingTargets: Array<keyof PositionDraft> = [
  "position_id",
  "instrument_type",
  "option_type",
  "style",
  "quantity",
  "notional",
  "underlying_symbol",
  "underlying_price",
  "strike",
  "volatility",
  "maturity_date",
  "valuation_date",
  "risk_free_rate",
  "dividend_yield",
  "currency",
  "liquidity_haircut",
  "model",
  "fixed_rate",
  "float_rate",
  "day_count",
];

export const requiredUploadTargets: Array<keyof PositionDraft> = [
  "position_id",
  "quantity",
  "underlying_symbol",
  "underlying_price",
  "strike",
  "maturity_date",
  "valuation_date",
  "risk_free_rate",
];
