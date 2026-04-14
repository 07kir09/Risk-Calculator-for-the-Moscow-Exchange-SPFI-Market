import { MetricsResponse, ScenarioDTO } from "../contracts/metrics";
import { PositionDTO } from "../types";
import { fetchMetrics } from "../endpoints";
import { mockFetchMetrics } from "./mock";

const VAR_ES_METRICS = new Set(["var_hist", "var_param", "es_hist", "es_param", "lc_var"]);

function filterMetricsBySelection(
  metrics: MetricsResponse,
  selectedMetrics: string[],
  marginEnabled: boolean
): MetricsResponse {
  const selected = new Set(selectedMetrics);
  const needsVarEs = selectedMetrics.some((metric) => VAR_ES_METRICS.has(metric));
  const needsCorrelations = selected.has("correlations");
  const needsGreeks = selected.has("greeks");
  const needsStress = selected.has("stress");
  const needsMargin = marginEnabled;

  const next: MetricsResponse = { ...metrics };

  if (!needsVarEs) {
    next.var_hist = null;
    next.es_hist = null;
    next.var_param = null;
    next.es_param = null;
    next.lc_var = null;
    next.lc_var_addon = null;
    next.lc_var_breakdown = null;
    next.limits = null;
  }

  if (!needsGreeks) {
    next.greeks = null;
  }

  if (!needsStress) {
    next.stress = null;
  }

  if (!needsCorrelations) {
    next.correlations = null;
    next.pnl_matrix = null;
  }

  if (!needsMargin) {
    next.capital = null;
    next.initial_margin = null;
    next.variation_margin = null;
  }

  if (!needsVarEs && !needsStress && !needsCorrelations) {
    next.pnl_distribution = null;
  }

  if (next.top_contributors) {
    const filteredContributors: Record<string, typeof next.top_contributors[string]> = {};
    if (needsVarEs && next.top_contributors.var_hist) filteredContributors.var_hist = next.top_contributors.var_hist;
    if (needsVarEs && next.top_contributors.es_hist) filteredContributors.es_hist = next.top_contributors.es_hist;
    if (needsStress && next.top_contributors.stress) filteredContributors.stress = next.top_contributors.stress;
    next.top_contributors = Object.keys(filteredContributors).length ? filteredContributors : null;
  }

  return next;
}

export async function runRiskCalculation(params: {
  positions: PositionDTO[];
  scenarios: ScenarioDTO[];
  limits?: Record<string, unknown>;
  alpha: number;
  horizonDays: number;
  parametricTailModel?: string;
  baseCurrency: string;
  fxRates?: Record<string, number>;
  liquidityModel: string;
  selectedMetrics: string[];
  marginEnabled: boolean;
  marketDataSessionId?: string;
}): Promise<MetricsResponse> {
  const viteEnv = ((import.meta as any).env ?? {}) as Record<string, any>;
  const demoMode = (viteEnv.VITE_DEMO_MODE ?? "1") === "1";
  if (demoMode) {
    const tailModel = params.parametricTailModel ?? "cornish_fisher";
    const metrics = await mockFetchMetrics();
    return filterMetricsBySelection({
      ...metrics,
      confidence_level: params.alpha,
      horizon_days: params.horizonDays,
      parametric_tail_model: tailModel,
      base_currency: params.baseCurrency,
      liquidity_model: params.liquidityModel,
      mode: "demo",
    }, params.selectedMetrics, params.marginEnabled);
  }

  const needsVarEs = params.selectedMetrics.some((m) => ["var_hist", "var_param", "es_hist", "es_param", "lc_var"].includes(m));
  const needsCorrelations = params.selectedMetrics.includes("correlations");
  const needsGreeks = params.selectedMetrics.includes("greeks");
  const needsStress = params.selectedMetrics.includes("stress");
  const needsMargin = params.marginEnabled;

  const metrics = await fetchMetrics({
    positions: params.positions,
    scenarios: params.scenarios,
    limits: params.limits,
    alpha: params.alpha,
    horizon_days: params.horizonDays,
    parametric_tail_model: params.parametricTailModel ?? "cornish_fisher",
    base_currency: params.baseCurrency,
    fx_rates: params.fxRates,
    liquidity_model: params.liquidityModel,
    mode: "api",
    calc_sensitivities: needsGreeks,
    calc_var_es: needsVarEs,
    calc_stress: needsStress,
    calc_margin_capital: needsMargin,
    calc_correlations: needsCorrelations,
    market_data_session_id: params.marketDataSessionId,
  });
  return filterMetricsBySelection(metrics, params.selectedMetrics, params.marginEnabled);
}
