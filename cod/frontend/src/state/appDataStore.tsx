import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { ImportLogEntry, PositionDTO } from "../api/types";
import { MetricsResponse, ScenarioDTO } from "../api/contracts/metrics";

export type DataSource = "demo" | "csv" | "api";

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
  results: { metrics: null },
};

type Action =
  | { type: "SET_PORTFOLIO"; positions: PositionDTO[]; source: DataSource; filename?: string }
  | { type: "SET_VALIDATION_LOG"; log: ImportLogEntry[] }
  | { type: "SET_SCENARIOS"; scenarios: ScenarioDTO[] }
  | { type: "SET_LIMITS"; limits: Record<string, any> | null }
  | { type: "SET_RESULTS"; metrics: MetricsResponse | null }
  | { type: "RESET_RESULTS" }
  | { type: "RESET_ALL" };

const STORAGE_KEY = "app_data_v1";

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
      return { ...state, limits: action.limits };
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
      return { ...init, ...JSON.parse(saved) } as AppDataState;
    } catch {
      return init;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

