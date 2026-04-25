import client from "./client";
import { PositionDTO } from "./types";
import { metricsSchema, scenarioSchema } from "./contracts/metrics";
import { marketDataSessionSummarySchema } from "./contracts/marketData";
import { mockFetchMarketDataSession, mockFetchScenarios, mockUploadMarketDataBundleFile } from "./services/mock";
import { z } from "zod";

const viteEnv = ((import.meta as any).env ?? {}) as Record<string, any>;
const defaultDemoMode = (globalThis as any).process?.env?.NODE_ENV === "test" ? "1" : "0";
const demoMode = (viteEnv.VITE_DEMO_MODE ?? defaultDemoMode) === "1";

export async function fetchMetrics(payload: {
  positions: PositionDTO[];
  scenarios: z.infer<typeof scenarioSchema>[];
  limits?: Record<string, unknown>;
  include?: Array<"correlations">;
  alpha?: number;
  horizon_days?: number;
  parametric_tail_model?: string;
  base_currency?: string;
  fx_rates?: Record<string, number>;
  liquidity_model?: string;
  mode?: "demo" | "api";
  calc_sensitivities?: boolean;
  calc_var_es?: boolean;
  calc_stress?: boolean;
  calc_margin_capital?: boolean;
  calc_correlations?: boolean;
  market_data_session_id?: string;
  auto_market_data?: boolean;
}) {
  const { data } = await client.post("/metrics", payload);
  return metricsSchema.parse(data);
}

export async function uploadMarketDataBundleFile(file: File, sessionId?: string) {
  if (demoMode) {
    return mockUploadMarketDataBundleFile(file);
  }
  const form = new FormData();
  form.append("file", file);
  if (sessionId) form.append("session_id", sessionId);
  const { data } = await client.post("/market-data/upload", form);
  return marketDataSessionSummarySchema.parse(data);
}

export async function fetchMarketDataSession(sessionId: string) {
  if (demoMode) {
    return mockFetchMarketDataSession();
  }
  const { data } = await client.get(`/market-data/${sessionId}`);
  return marketDataSessionSummarySchema.parse(data);
}

export async function loadDefaultMarketDataBundle() {
  if (demoMode) {
    return mockFetchMarketDataSession();
  }
  const { data } = await client.post("/market-data/load-default");
  return marketDataSessionSummarySchema.parse(data);
}

export async function syncLiveMarketData(params?: { asOfDate?: string; lookbackDays?: number }) {
  if (demoMode) {
    return mockFetchMarketDataSession();
  }
  const { data } = await client.post("/market-data/sync-live", {
    as_of_date: params?.asOfDate,
    lookback_days: params?.lookbackDays ?? 180,
  });
  return marketDataSessionSummarySchema.parse(data);
}

export async function fetchLimits() {
  const { data } = await client.get("/limits");
  return data;
}

export async function fetchScenarioCatalog() {
  if (demoMode) {
    return mockFetchScenarios();
  }
  const { data } = await client.get("/scenarios");
  const arr = z.array(scenarioSchema);
  return arr.parse(data);
}
