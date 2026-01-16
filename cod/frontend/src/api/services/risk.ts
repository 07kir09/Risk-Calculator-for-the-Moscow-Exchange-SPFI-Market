import { MetricsResponse, ScenarioDTO } from "../contracts/metrics";
import { PositionDTO } from "../types";
import { fetchMetrics } from "../endpoints";
import { mockFetchMetrics } from "./mock";

export async function runRiskCalculation(params: {
  positions: PositionDTO[];
  scenarios: ScenarioDTO[];
  limits?: Record<string, unknown>;
  alpha: number;
  selectedMetrics: string[];
  marginEnabled: boolean;
}): Promise<MetricsResponse> {
  const viteEnv = ((import.meta as any).env ?? {}) as Record<string, any>;
  const demoMode = (viteEnv.VITE_DEMO_MODE ?? "1") === "1";
  if (demoMode) return mockFetchMetrics();

  const needsVarEs = params.selectedMetrics.some((m) => ["var_hist", "var_param", "es_hist", "es_param", "lc_var", "correlations"].includes(m));
  const needsGreeks = params.selectedMetrics.includes("greeks");
  const needsStress = params.selectedMetrics.includes("stress");
  const needsMargin = params.marginEnabled;

  return fetchMetrics({
    positions: params.positions,
    scenarios: params.scenarios,
    limits: params.limits,
    alpha: params.alpha,
    calc_sensitivities: needsGreeks,
    calc_var_es: needsVarEs,
    calc_stress: needsStress,
    calc_margin_capital: needsMargin,
  });
}
