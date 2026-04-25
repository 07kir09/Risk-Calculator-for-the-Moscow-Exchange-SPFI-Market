import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { ImportLogEntry, PositionDTO } from "../api/types";
import { MetricsResponse, ScenarioDTO } from "../api/contracts/metrics";
import { MarketDataSessionSummary } from "../api/contracts/marketData";
import { LimitSource } from "../lib/limitSource";

export type DataSource = "demo" | "csv" | "xlsx" | "api" | "paste";
export type MarketDataMode = "api_auto" | "manual_bundle";

export interface AppDataState {
  portfolio: {
    source: DataSource;
    importedAt?: string;
    filename?: string;
    positions: PositionDTO[];
  };
  validationLog: ImportLogEntry[];
  scenarios: ScenarioDTO[];
  limits: Record<string, any> | null;
  limitSource: LimitSource;
  marketDataSummary: MarketDataSessionSummary | null;
  marketDataMode: MarketDataMode;
  results: {
    metrics: MetricsResponse | null;
    computedAt?: string;
  };
}

export const initialAppDataState: AppDataState = {
  portfolio: { source: "demo", positions: [] },
  validationLog: [],
  scenarios: [],
  limits: null,
  limitSource: "draft_auto",
  marketDataSummary: null,
  marketDataMode: "api_auto",
  results: { metrics: null },
};

type Action =
  | { type: "SET_PORTFOLIO"; positions: PositionDTO[]; source: DataSource; filename?: string }
  | { type: "SET_VALIDATION_LOG"; log: ImportLogEntry[] }
  | { type: "SET_SCENARIOS"; scenarios: ScenarioDTO[] }
  | { type: "SET_LIMITS"; limits: Record<string, any> | null; limitSource?: LimitSource }
  | { type: "SET_MARKET_DATA_SUMMARY"; summary: MarketDataSessionSummary | null }
  | { type: "SET_MARKET_DATA_MODE"; mode: MarketDataMode }
  | { type: "SET_RESULTS"; metrics: MetricsResponse | null }
  | { type: "RESET_RESULTS" }
  | { type: "RESET_ALL" };

const STORAGE_KEY = "app_data_v1";
const MAX_VALIDATION_LOG_ENTRIES = 800;
const MAX_SCENARIOS_FOR_STORAGE = 3000;
const MAX_PNL_DISTRIBUTION_POINTS = 1500;
const MAX_STRESS_ROWS = 400;
const MAX_LC_BREAKDOWN_ROWS = 400;
const MAX_CONTRIBUTORS_PER_METRIC = 40;
const viteEnv = ((import.meta as any).env ?? {}) as Record<string, any>;
const defaultDemoMode = (globalThis as any).process?.env?.NODE_ENV === "test" ? "1" : "0";
const isDemoMode = (viteEnv.VITE_DEMO_MODE ?? defaultDemoMode) === "1";
const legacyDemoScenarioIds = new Set(["mild_down", "base", "shock_down", "shock_0", "shock_1", "shock_2", "shock_3", "shock_4", "shock_5", "shock_6"]);

function hasSquareMatrix(matrix: unknown): boolean {
  if (!Array.isArray(matrix) || matrix.length < 2) return false;
  return matrix.every((row) => Array.isArray(row) && row.length >= 2);
}

export function metricsNeedCorrelationRefetch(metrics: MetricsResponse | null): boolean {
  if (!metrics) return false;
  return !hasSquareMatrix(metrics.correlations) || !hasSquareMatrix(metrics.pnl_matrix);
}

function tail<T>(items: T[] | undefined | null, limit: number): T[] {
  if (!items || items.length <= limit) return items ?? [];
  return items.slice(items.length - limit);
}

function head<T>(items: T[] | undefined | null, limit: number): T[] {
  if (!items || items.length <= limit) return items ?? [];
  return items.slice(0, limit);
}

function sanitizeMetricsForStorage(metrics: MetricsResponse | null): MetricsResponse | null {
  if (!metrics) return null;

  const topContributors = metrics.top_contributors
    ? Object.fromEntries(
        Object.entries(metrics.top_contributors).map(([metric, rows]) => [metric, head(rows, MAX_CONTRIBUTORS_PER_METRIC)])
      )
    : metrics.top_contributors;

  return {
    ...metrics,
    // Самые тяжёлые поля не сохраняем целиком, чтобы не переполнять localStorage.
    pnl_matrix: undefined,
    correlations: undefined,
    validation_log: head(metrics.validation_log, MAX_VALIDATION_LOG_ENTRIES),
    pnl_distribution: head(metrics.pnl_distribution, MAX_PNL_DISTRIBUTION_POINTS),
    stress: head(metrics.stress, MAX_STRESS_ROWS),
    lc_var_breakdown: head(metrics.lc_var_breakdown, MAX_LC_BREAKDOWN_ROWS),
    top_contributors: topContributors,
  };
}

function looksLikeDemoMarketSession(summary: MarketDataSessionSummary | null | undefined): boolean {
  return String(summary?.session_id ?? "").toLowerCase() === "demo-market-session";
}

function looksLikeDemoMetrics(metrics: MetricsResponse | null | undefined): boolean {
  return String(metrics?.mode ?? "").toLowerCase() === "demo" ||
    String(metrics?.market_data_source ?? "").toLowerCase() === "demo_default" ||
    String(metrics?.methodology_metadata?.limit_source ?? "").toLowerCase() === "demo_default";
}

function looksLikeLegacyDemoScenarios(scenarios: ScenarioDTO[] | undefined | null): boolean {
  return Boolean(scenarios?.length) && scenarios!.every((scenario) => legacyDemoScenarioIds.has(scenario.scenario_id));
}

function sanitizeLoadedStateForRuntime(state: AppDataState): AppDataState {
  if (isDemoMode) return state;
  const hasDemoMarketSession = looksLikeDemoMarketSession(state.marketDataSummary);
  const hasDemoMetrics = looksLikeDemoMetrics(state.results.metrics);
  const hasLegacyDemoScenarios = looksLikeLegacyDemoScenarios(state.scenarios);

  if (!hasDemoMarketSession && !hasDemoMetrics && !hasLegacyDemoScenarios) return state;

  return {
    ...state,
    marketDataSummary: hasDemoMarketSession ? null : state.marketDataSummary,
    scenarios: hasLegacyDemoScenarios ? [] : state.scenarios,
    results: hasDemoMetrics || hasDemoMarketSession || hasLegacyDemoScenarios ? { metrics: null } : state.results,
  };
}

function buildStorageSnapshot(state: AppDataState): AppDataState {
  return {
    ...state,
    validationLog: tail(state.validationLog, MAX_VALIDATION_LOG_ENTRIES),
    scenarios: head(state.scenarios, MAX_SCENARIOS_FOR_STORAGE),
    results: {
      ...state.results,
      metrics: sanitizeMetricsForStorage(state.results.metrics),
    },
  };
}

function buildFallbackStorageSnapshot(state: AppDataState): AppDataState {
  return {
    ...state,
    validationLog: [],
    scenarios: [],
    limits: null,
    limitSource: "draft_auto",
    results: { metrics: null, computedAt: state.results.computedAt },
  };
}

function reducer(state: AppDataState, action: Action): AppDataState {
  switch (action.type) {
    case "SET_PORTFOLIO":
      return {
        ...state,
        portfolio: {
          source: action.source,
          importedAt: new Date().toISOString(),
          filename: action.filename,
          positions: action.positions,
        },
        results: { metrics: null },
      };
    case "SET_VALIDATION_LOG":
      return { ...state, validationLog: action.log };
    case "SET_SCENARIOS":
      return { ...state, scenarios: action.scenarios };
    case "SET_LIMITS":
      return {
        ...state,
        limits: action.limits,
        limitSource: action.limitSource ?? (action.limits ? "manual_user" : "draft_auto"),
      };
    case "SET_MARKET_DATA_SUMMARY":
      return { ...state, marketDataSummary: action.summary, results: { metrics: null } };
    case "SET_MARKET_DATA_MODE":
      return { ...state, marketDataMode: action.mode, results: { metrics: null } };
    case "SET_RESULTS":
      return { ...state, results: { metrics: action.metrics, computedAt: action.metrics ? new Date().toISOString() : undefined } };
    case "RESET_RESULTS":
      return { ...state, results: { metrics: null }, };
    case "RESET_ALL":
      return initialAppDataState;
    default:
      return state;
  }
}

const Ctx = createContext<{ state: AppDataState; dispatch: React.Dispatch<Action> } | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialAppDataState, (init) => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return init;
    try {
      const parsed = JSON.parse(saved) as Partial<AppDataState>;
      return sanitizeLoadedStateForRuntime({ ...init, ...parsed, limitSource: parsed.limitSource ?? init.limitSource } as AppDataState);
    } catch {
      return init;
    }
  });

  useEffect(() => {
    const snapshot = buildStorageSnapshot(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("AppDataProvider: localStorage quota exceeded, saving minimal snapshot", error);
      const fallbackSnapshot = buildFallbackStorageSnapshot(snapshot);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackSnapshot));
      } catch (fallbackError) {
        console.warn("AppDataProvider: unable to persist fallback snapshot, clearing saved state", fallbackError);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // No-op.
        }
      }
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
