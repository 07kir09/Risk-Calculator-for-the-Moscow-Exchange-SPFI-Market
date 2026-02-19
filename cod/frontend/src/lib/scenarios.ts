import { MetricsResponse } from "../api/contracts/metrics";

export const CONFIG_PRESET_STORAGE = "risk_ui_config_presets_v1";
export const RUN_HISTORY_STORAGE = "risk_ui_run_history_v1";

export type ConfigPreset = {
  id: string;
  name: string;
  selected: string[];
  params: {
    alpha: number;
    horizonDays: number;
    historyDays: number;
    baseCurrency: string;
    liquidityModel: string;
    fxRatesText: string;
  };
};

export type RunSnapshot = {
  id: string;
  calcRunId?: string;
  createdAt: string;
  scope: "portfolio" | "single";
  positionCount: number;
  metrics: {
    base_value?: number | null;
    var_hist?: number | null;
    es_hist?: number | null;
    lc_var?: number | null;
    initial_margin?: number | null;
  };
  baseCurrency: string;
};

export function loadStoredList<T>(storageKey: string): T[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function saveStoredList<T>(storageKey: string, value: T[]): void {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

export function loadConfigPresets(): ConfigPreset[] {
  return loadStoredList<ConfigPreset>(CONFIG_PRESET_STORAGE);
}

export function saveConfigPresets(value: ConfigPreset[]): void {
  saveStoredList(CONFIG_PRESET_STORAGE, value);
}

export function loadRunHistory(): RunSnapshot[] {
  return loadStoredList<RunSnapshot>(RUN_HISTORY_STORAGE);
}

export function pushRunSnapshot(metrics: MetricsResponse, params: {
  calcRunId?: string;
  scope: "portfolio" | "single";
  positionCount: number;
  baseCurrency: string;
}): RunSnapshot[] {
  const snapshot: RunSnapshot = {
    id: crypto.randomUUID(),
    calcRunId: params.calcRunId,
    createdAt: new Date().toISOString(),
    scope: params.scope,
    positionCount: params.positionCount,
    baseCurrency: params.baseCurrency,
    metrics: {
      base_value: metrics.base_value,
      var_hist: metrics.var_hist,
      es_hist: metrics.es_hist,
      lc_var: metrics.lc_var,
      initial_margin: metrics.initial_margin,
    },
  };
  const next = [snapshot, ...loadRunHistory()].slice(0, 24);
  saveStoredList(RUN_HISTORY_STORAGE, next);
  return next;
}
