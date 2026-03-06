export type InstrumentType = "option" | "forward" | "swap_ir";
export type OptionType = "call" | "put";
export type OptionStyle = "european" | "american";

export type PositionDraft = {
  instrument_type?: InstrumentType;
  position_id: string;
  option_type?: OptionType;
  style?: OptionStyle;
  quantity: number;
  notional?: number;
  underlying_symbol: string;
  underlying_price: number;
  strike: number;
  volatility?: number;
  maturity_date: string;
  valuation_date: string;
  risk_free_rate: number;
  dividend_yield?: number;
  currency?: string;
  liquidity_haircut?: number;
  model?: string | null;
  fixed_rate?: number | null;
  float_rate?: number | null;
  day_count?: number | null;
};

export type ScenarioDraft = {
  scenario_id: string;
  underlying_shift?: number;
  volatility_shift?: number;
  rate_shift?: number;
  probability?: number | null;
};

export type RunConfigDraft = {
  alpha?: number;
  horizon_days?: number;
  parametric_tail_model?: "normal" | "cornish_fisher";
  base_currency?: string;
  fx_rates?: Record<string, number> | null;
  liquidity_model?:
    | "fraction_of_position_value"
    | "half_spread_fraction"
    | "absolute_per_contract";
  mode?: "demo" | "api" | string;
  calc_sensitivities?: boolean;
  calc_var_es?: boolean;
  calc_stress?: boolean;
  calc_margin_capital?: boolean;
  calc_correlations?: boolean;
};

export type MetricsRequest = {
  positions: PositionDraft[];
  scenarios: ScenarioDraft[];
  limits?: Record<string, any> | null;
  alpha?: number;
  horizon_days?: number;
  parametric_tail_model?: "normal" | "cornish_fisher";
  base_currency?: string;
  fx_rates?: Record<string, number> | null;
  liquidity_model?:
    | "fraction_of_position_value"
    | "half_spread_fraction"
    | "absolute_per_contract";
  mode?: "demo" | "api" | string;
  calc_sensitivities?: boolean;
  calc_var_es?: boolean;
  calc_stress?: boolean;
  calc_margin_capital?: boolean;
  calc_correlations?: boolean;
};

export type ValidationMessage = {
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  row?: number | null;
  field?: string | null;
};

export type StressResult = {
  scenario_id: string;
  pnl: number;
  limit: number | null;
  breached: boolean;
};

export type TopContributorRow = {
  metric: "var_hist" | "es_hist" | "stress";
  position_id: string;
  pnl_contribution: number;
  abs_pnl_contribution: number;
  scenario_id?: string;
};

export type MetricsResponse = {
  base_value: number;
  var_hist: number | null;
  es_hist: number | null;
  var_param: number | null;
  es_param: number | null;
  lc_var: number | null;
  lc_var_addon: number | null;
  lc_var_breakdown:
    | Array<{
        position_id: string;
        model: string;
        quantity: number;
        position_value: number;
        haircut_input: number;
        add_on_money: number;
      }>
    | null;
  greeks: Record<string, number> | null;
  stress: StressResult[] | null;
  top_contributors: {
    var_hist: TopContributorRow[];
    es_hist: TopContributorRow[];
    stress: TopContributorRow[];
  } | null;
  limits: Array<[string, number, number, boolean]> | null;
  correlations: number[][] | null;
  pnl_matrix: number[][] | null;
  pnl_distribution: number[] | null;
  buckets: Record<string, Record<string, number>> | null;
  base_currency: string;
  confidence_level: number;
  horizon_days: number;
  parametric_tail_model: string;
  mode: string;
  liquidity_model: string;
  methodology_note: string | null;
  fx_warning: string | null;
  capital: number | null;
  initial_margin: number | null;
  variation_margin: number | null;
  validation_log: ValidationMessage[];
};

export type NormalizedValidationIssue = {
  index?: number;
  field?: string;
  message: string;
};

export type ApiErrorKind = "validation" | "business" | "internal" | "network" | "unknown";

export type ApiErrorModel = {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  requestId?: string;
  traceId?: string;
  details?: unknown;
  validationIssues?: NormalizedValidationIssue[];
};

export type RequestMeta = {
  requestId?: string;
  traceId?: string;
  statusCode?: number;
  responseMs?: number;
};

export type RunStatus = "Draft" | "Ready to calculate" | "Calculating" | "Updated just now" | "Error" | "Outdated";

export type ContributorMetric = "var_hist" | "es_hist" | "stress";
