import { MetricsResponse, ScenarioDraft } from "../../shared/types/contracts";

export type KeyRiskRow = {
  metric: string;
  value: number | null;
  limit: number | null;
  breached: boolean;
  notes?: string;
};

export function mapLimitsTuples(result: MetricsResponse | null): Array<{ metric: string; value: number; limit: number; breached: boolean }> {
  if (!result?.limits) {
    return [];
  }
  return result.limits.map(([metric, value, limit, breached]) => ({
    metric,
    value,
    limit,
    breached,
  }));
}

export function mapKeyRiskRows(result: MetricsResponse | null): KeyRiskRow[] {
  if (!result) return [];

  const limitMap = new Map(mapLimitsTuples(result).map((row) => [row.metric, row]));
  const metricRows: Array<[string, number | null]> = [
    ["base_value", result.base_value],
    ["var_hist", result.var_hist],
    ["es_hist", result.es_hist],
    ["var_param", result.var_param],
    ["es_param", result.es_param],
    ["lc_var", result.lc_var],
    ["capital", result.capital],
    ["initial_margin", result.initial_margin],
    ["variation_margin", result.variation_margin],
  ];

  return metricRows.map(([metric, value]) => {
    const limitRow = limitMap.get(metric);
    return {
      metric,
      value,
      limit: limitRow?.limit ?? null,
      breached: limitRow?.breached ?? false,
      notes: value === null ? "Not calculated" : undefined,
    };
  });
}

export function mapScenarioResultRows(
  scenarios: ScenarioDraft[],
  stressRows: MetricsResponse["stress"],
  pnlDistribution: number[] | null | undefined
): Array<{
  scenario_id: string;
  underlying_shift: number;
  volatility_shift: number;
  rate_shift: number;
  probability: number | null | undefined;
  pnl: number | null;
  limit: number | null;
  breached: boolean;
}> {
  const stressMap = new Map((stressRows ?? []).map((row) => [row.scenario_id, row]));

  return scenarios.map((scenario, index) => {
    const stress = stressMap.get(scenario.scenario_id);
    return {
      scenario_id: scenario.scenario_id,
      underlying_shift: scenario.underlying_shift ?? 0,
      volatility_shift: scenario.volatility_shift ?? 0,
      rate_shift: scenario.rate_shift ?? 0,
      probability: scenario.probability,
      pnl: stress?.pnl ?? pnlDistribution?.[index] ?? null,
      limit: stress?.limit ?? null,
      breached: stress?.breached ?? false,
    };
  });
}
