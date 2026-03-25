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
  start_date?: string;
  settlement_date?: string;
  collateral_currency?: string;
  discount_curve_ref?: string;
  projection_curve_ref?: string;
  fixing_index_ref?: string;
  day_count_convention?: string;
  business_day_convention?: string;
  reset_convention?: string;
  payment_lag_days?: number;
  fixed_leg_frequency_months?: number;
  float_leg_frequency_months?: number;
  float_spread?: number;
  pay_currency?: string;
  receive_currency?: string;
  pay_leg_notional?: number;
  receive_leg_notional?: number;
  pay_discount_curve_ref?: string;
  receive_discount_curve_ref?: string;
  pay_projection_curve_ref?: string;
  receive_projection_curve_ref?: string;
  pay_day_count_convention?: string;
  receive_day_count_convention?: string;
  pay_business_day_convention?: string;
  receive_business_day_convention?: string;
  pay_calendar?: string;
  receive_calendar?: string;
  pay_fixing_calendar?: string;
  receive_fixing_calendar?: string;
  pay_fixed_rate?: number;
  receive_fixed_rate?: number;
  pay_spread?: number;
  receive_spread?: number;
  fixing_days_lag?: number;
  pay_fixing_days_lag?: number;
  receive_fixing_days_lag?: number;
  pay_payment_lag_days?: number;
  receive_payment_lag_days?: number;
  pay_reset_convention?: string;
  receive_reset_convention?: string;
  exchange_principal?: boolean;
  spot_fx?: number;
}

export interface MarketScenario {
  scenario_id: string;
  underlying_shift: number;
  volatility_shift: number;
  rate_shift: number;
  probability?: number;
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
