export type OptionType = "call" | "put";
export type OptionStyle = "european" | "american";

export interface OptionPosition {
  position_id: string;
  option_type: OptionType;
  style: OptionStyle;
  quantity: number;
  underlying_symbol: string;
  currency: string;
  underlying_price: number;
  strike: number;
  volatility: number;
  maturity_date: string; // ISO
  valuation_date: string; // ISO
  risk_free_rate: number;
  dividend_yield?: number;
  liquidity_haircut?: number;
  model?: "black_scholes" | "binomial" | "mc";
}

export interface MarketScenario {
  scenario_id: string;
  underlying_shift: number;
  volatility_shift: number;
  rate_shift: number;
  description?: string;
}

export interface ValidationMessage {
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  row?: number;
  field?: string;
}

export interface PortfolioMetrics {
  base_value: number;
  var_hist: number;
  es_hist: number;
  var_param: number;
  es_param: number;
  lc_var: number;
  greeks: Record<string, number>;
}

export interface StressResult {
  scenario_id: string;
  pnl: number;
  limit?: number;
  breached: boolean;
}
