import type { MetricsResponse } from "../api/contracts/metrics";

const DEMO_LIMITS = {
  var_hist: 5_000,
  es_hist: 6_500,
  lc_var: 7_500,
};

const POLICY_MULTIPLIERS = {
  var_hist: 0.3,
  es_hist: 0.4,
  lc_var: 0.45,
  stress: 0.5,
} as const;

const METRIC_FLOORS = {
  var_hist: 1.12,
  es_hist: 1.18,
  lc_var: 1.2,
  stress: 1.25,
} as const;

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function nearlyEqual(a: number, b: number) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / scale < 1e-9;
}

function roundLimitUp(value: number) {
  const safe = Math.abs(value);
  if (!Number.isFinite(safe) || safe <= 0) return 0;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(safe)) - 1);
  return Math.ceil(safe / magnitude) * magnitude;
}

function bucketExposure(metrics: MetricsResponse) {
  const buckets = metrics.buckets;
  if (!buckets || typeof buckets !== "object") return 0;
  return Object.values(buckets).reduce((sum, bucket) => {
    const notional = bucket && typeof bucket === "object" ? bucket.notional : undefined;
    return sum + (isFinitePositive(notional) ? Math.abs(notional) : 0);
  }, 0);
}

function riskScale(metrics: MetricsResponse) {
  const baseValue = isFinitePositive(metrics.base_value) ? Math.abs(metrics.base_value) : 0;
  const notionalScale = bucketExposure(metrics) * 0.25;
  const largestRisk = Math.max(
    isFinitePositive(metrics.var_hist) ? Math.abs(metrics.var_hist) : 0,
    isFinitePositive(metrics.es_hist) ? Math.abs(metrics.es_hist) : 0,
    isFinitePositive(metrics.lc_var) ? Math.abs(metrics.lc_var) : 0,
    ...(metrics.stress ?? []).map((row) => (row.pnl < 0 ? Math.abs(row.pnl) : 0))
  );

  // Auto thresholds are draft control thresholds, not approved risk policy and
  // not "current fact + 25%". Scale comes from portfolio/exposure size; metric
  // floors keep auto mode away from demo defaults.
  return Math.max(baseValue, notionalScale, largestRisk * 0.35, 50_000);
}

export function isDemoDefaultLimits(limits: Record<string, unknown> | null | undefined) {
  if (!limits) return false;
  return Object.entries(DEMO_LIMITS).every(([key, expected]) => {
    const value = limits[key];
    return typeof value === "number" && nearlyEqual(value, expected);
  });
}

export function isDemoDefaultLimitRows(limits: MetricsResponse["limits"]) {
  if (!limits?.length) return false;
  return Object.entries(DEMO_LIMITS).every(([key, expected]) => {
    const row = limits.find(([metric]) => metric === key);
    return row ? nearlyEqual(row[2], expected) : false;
  });
}

export function buildAutoLimitConfig(metrics: MetricsResponse): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  const scale = riskScale(metrics);

  for (const key of ["var_hist", "es_hist", "lc_var"] as const) {
    const value = metrics[key];
    if (isFinitePositive(value)) {
      const policyLimit = scale * POLICY_MULTIPLIERS[key];
      const softFloor = Math.abs(value) * METRIC_FLOORS[key];
      out[key] = roundLimitUp(Math.max(policyLimit, softFloor));
    }
  }

  const stressLimits: Record<string, number> = {};
  for (const row of metrics.stress ?? []) {
    if (row.pnl < 0) {
      const loss = Math.abs(row.pnl);
      stressLimits[row.scenario_id] = roundLimitUp(Math.max(scale * POLICY_MULTIPLIERS.stress, loss * METRIC_FLOORS.stress));
    }
  }
  if (Object.keys(stressLimits).length) {
    out.stress = stressLimits;
  }

  return Object.keys(out).length ? out : null;
}

export function applyLimitConfig(metrics: MetricsResponse, config: Record<string, unknown> | null | undefined): MetricsResponse {
  if (!config) return metrics;

  const limitRows: NonNullable<MetricsResponse["limits"]> = [];
  for (const key of ["var_hist", "es_hist", "lc_var"] as const) {
    const value = metrics[key];
    const limit = config[key];
    if (isFinitePositive(value) && typeof limit === "number" && limit > 0) {
      limitRows.push([key, value, limit, value > limit]);
    }
  }

  const stressConfig = config.stress && typeof config.stress === "object" && !Array.isArray(config.stress)
    ? config.stress as Record<string, number>
    : {};
  const stress = (metrics.stress ?? []).map((row) => {
    const limit = stressConfig[row.scenario_id];
    if (!isFinitePositive(limit)) return row;
    return {
      ...row,
      limit,
      breached: row.pnl < -limit,
    };
  });

  return {
    ...metrics,
    limits: limitRows,
    stress,
  };
}

export function applyAutoLimits(metrics: MetricsResponse): MetricsResponse {
  return applyLimitConfig(metrics, buildAutoLimitConfig(metrics));
}
