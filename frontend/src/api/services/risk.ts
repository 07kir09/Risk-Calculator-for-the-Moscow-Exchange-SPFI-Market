import { MetricsResponse, ScenarioDTO } from "../contracts/metrics";
import { PositionDTO } from "../types";
import { fetchMetrics } from "../endpoints";
import { mockFetchMetrics } from "./mock";

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
  forceAutoMarketData?: boolean;
}): Promise<MetricsResponse> {
  const viteEnv = ((import.meta as any).env ?? {}) as Record<string, any>;
  const defaultDemoMode = (globalThis as any).process?.env?.NODE_ENV === "test" ? "1" : "0";
  const demoMode = (viteEnv.VITE_DEMO_MODE ?? defaultDemoMode) === "1";
  if (demoMode) {
    const tailModel = params.parametricTailModel ?? "cornish_fisher";
    const metrics = await mockFetchMetrics();
    return {
      ...metrics,
      confidence_level: params.alpha,
      horizon_days: params.horizonDays,
      parametric_tail_model: tailModel,
      base_currency: params.baseCurrency,
      liquidity_model: params.liquidityModel,
      mode: "demo",
    };
  }

  const needsVarEs = params.selectedMetrics.some((m) => ["var_hist", "var_param", "es_hist", "es_param", "lc_var"].includes(m));
  const needsCorrelations = params.selectedMetrics.includes("correlations");
  const needsGreeks = params.selectedMetrics.includes("greeks");
  const needsStress = params.selectedMetrics.includes("stress");
  const needsMargin = params.marginEnabled;
  const envAuto = (viteEnv.VITE_AUTO_MARKET_DATA ?? "1") === "1";
  const autoMarketData =
    params.forceAutoMarketData !== undefined
      ? params.forceAutoMarketData
      : !params.marketDataSessionId && envAuto;

  return fetchMetrics({
    positions: params.positions,
    scenarios: params.scenarios,
    limits: params.limits,
    include: needsCorrelations ? ["correlations"] : undefined,
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
    market_data_session_id: params.marketDataSessionId,
    auto_market_data: autoMarketData,
  });
}
