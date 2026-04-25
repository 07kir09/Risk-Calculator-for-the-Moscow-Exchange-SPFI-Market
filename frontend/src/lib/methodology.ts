import type { MetricsResponse } from "../api/contracts/metrics";
import type { LimitSource } from "./limitSource";
import { isPreliminaryLimitSource, limitSourceDescription } from "./limitSource";

export type MethodologyMetadata = NonNullable<MetricsResponse["methodology_metadata"]>;

export const STRESS_SOURCE_BACKEND = "backend_calculated";
export const STRESS_SOURCE_FRONTEND_SANDBOX = "frontend_sandbox_estimate";
export const VAR_METHOD_SCENARIO = "scenario_quantile";

export function buildMethodologyMetadata({
  metrics,
  limitSource,
  stressSource = STRESS_SOURCE_BACKEND,
  exportGeneratedAt = null,
}: {
  metrics: MetricsResponse | null;
  limitSource: LimitSource;
  stressSource?: typeof STRESS_SOURCE_BACKEND | typeof STRESS_SOURCE_FRONTEND_SANDBOX;
  exportGeneratedAt?: string | null;
}): MethodologyMetadata {
  const preliminary = isPreliminaryLimitSource(limitSource) || stressSource !== STRESS_SOURCE_BACKEND || Boolean(metrics?.methodology_note);
  return {
    methodology_status: preliminary ? "preliminary" : "approved",
    limit_source: limitSource,
    preliminary,
    draft_policy_note: isPreliminaryLimitSource(limitSource) ? limitSourceDescription(limitSource) : null,
    var_method: VAR_METHOD_SCENARIO,
    scenario_count: metrics?.stress?.length ?? metrics?.pnl_distribution?.length ?? 0,
    stress_source: stressSource,
    backend_calculated: stressSource === STRESS_SOURCE_BACKEND,
    export_generated_at: exportGeneratedAt,
  };
}

export function attachMethodologyMetadata(
  metrics: MetricsResponse,
  limitSource: LimitSource,
  stressSource: typeof STRESS_SOURCE_BACKEND | typeof STRESS_SOURCE_FRONTEND_SANDBOX = STRESS_SOURCE_BACKEND
): MetricsResponse {
  return {
    ...metrics,
    limit_source: limitSource,
    methodology_metadata: buildMethodologyMetadata({ metrics, limitSource, stressSource }),
  };
}
