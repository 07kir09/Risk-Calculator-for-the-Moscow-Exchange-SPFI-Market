import { create } from "zustand";
import {
  ApiErrorModel,
  ContributorMetric,
  MetricsResponse,
  PositionDraft,
  RequestMeta,
  RunConfigDraft,
  RunStatus,
  ScenarioDraft,
} from "../../shared/types/contracts";
import { defaultLimits, defaultPositions, defaultRunConfig, defaultScenarios } from "../../shared/constants/defaults";
import { FieldIssue } from "../../shared/lib/validation";

type RiskStoreState = {
  positionsDraft: PositionDraft[];
  scenariosDraft: ScenarioDraft[];
  limitsDraft: Record<string, any> | null;
  runConfigDraft: RunConfigDraft;

  calculationResult: MetricsResponse | null;
  connected: boolean;
  lastHealthCheckAt: number | null;

  runStatus: RunStatus;
  lastCalculatedAt: number | null;
  isDirty: boolean;
  isCalculating: boolean;

  selectedScenarioId: string | null;
  selectedContributorMetric: ContributorMetric;

  clientValidationErrors: FieldIssue[];
  requestValidationErrors: FieldIssue[];
  lastError: ApiErrorModel | null;
  requestMeta: RequestMeta | null;

  showSettingsDrawer: boolean;
  showDebugDrawer: boolean;

  globalSearchQuery: string;
  positionsFilterPreset: PositionsFilterPreset;
  scenariosFilterPreset: ScenariosFilterPreset;
};

type RiskStoreActions = {
  setConnected: (value: boolean) => void;
  setLastHealthCheckAt: (timestamp: number) => void;

  setPositionsDraft: (value: PositionDraft[]) => void;
  addPosition: (value: PositionDraft) => void;
  updatePosition: (positionId: string, patch: Partial<PositionDraft>) => void;
  duplicatePosition: (positionId: string) => void;
  deletePositions: (positionIds: string[]) => void;
  resetPositions: () => void;

  setScenariosDraft: (value: ScenarioDraft[]) => void;
  addScenario: (value: ScenarioDraft) => void;
  updateScenario: (scenarioId: string, patch: Partial<ScenarioDraft>) => void;
  duplicateScenario: (scenarioId: string) => void;
  deleteScenarios: (scenarioIds: string[]) => void;
  normalizeScenarioProbabilities: () => void;

  setLimitsDraft: (value: Record<string, any> | null) => void;
  clearLimits: () => void;

  setRunConfigDraft: (patch: Partial<RunConfigDraft>) => void;

  setClientValidationErrors: (issues: FieldIssue[]) => void;
  setRequestValidationErrors: (issues: FieldIssue[]) => void;
  clearErrors: () => void;

  setRequestMeta: (meta: RequestMeta | null) => void;
  setLastError: (error: ApiErrorModel | null) => void;

  setCalculationResult: (result: MetricsResponse, meta: RequestMeta | null) => void;
  startCalculation: () => void;
  finishCalculationError: (error: ApiErrorModel, meta?: RequestMeta | null) => void;

  setSelectedScenarioId: (value: string | null) => void;
  setSelectedContributorMetric: (value: ContributorMetric) => void;

  setShowSettingsDrawer: (value: boolean) => void;
  setShowDebugDrawer: (value: boolean) => void;

  setGlobalSearchQuery: (value: string) => void;
  setPositionsFilterPreset: (value: PositionsFilterPreset) => void;
  setScenariosFilterPreset: (value: ScenariosFilterPreset) => void;

  loadDefaultLimits: (value: Record<string, any>) => void;
  loadDefaultScenarios: (value: ScenarioDraft[]) => void;
  importPositions: (rows: PositionDraft[]) => void;
  resetDraft: () => void;
};

export type RiskStore = RiskStoreState & RiskStoreActions;

export type PositionsFilterPreset =
  | "all"
  | "options"
  | "forwards"
  | "swaps"
  | "long"
  | "short"
  | "multi_currency";
export type ScenariosFilterPreset = "all" | "with_probability" | "stress_only" | "base_like";

function markDirty(state: RiskStoreState): Pick<RiskStoreState, "isDirty" | "runStatus"> {
  if (state.calculationResult) {
    return { isDirty: true, runStatus: "Outdated" };
  }
  return { isDirty: true, runStatus: "Draft" };
}

export const useRiskStore = create<RiskStore>((set, get) => ({
  positionsDraft: [...defaultPositions],
  scenariosDraft: [...defaultScenarios],
  limitsDraft: { ...defaultLimits },
  runConfigDraft: { ...defaultRunConfig },

  calculationResult: null,
  connected: false,
  lastHealthCheckAt: null,

  runStatus: "Ready to calculate",
  lastCalculatedAt: null,
  isDirty: false,
  isCalculating: false,

  selectedScenarioId: null,
  selectedContributorMetric: "stress",

  clientValidationErrors: [],
  requestValidationErrors: [],
  lastError: null,
  requestMeta: null,

  showSettingsDrawer: false,
  showDebugDrawer: false,

  globalSearchQuery: "",
  positionsFilterPreset: "all",
  scenariosFilterPreset: "all",

  setConnected: (value) => set({ connected: value }),
  setLastHealthCheckAt: (timestamp) => set({ lastHealthCheckAt: timestamp }),

  setPositionsDraft: (value) => {
    set((state) => ({ positionsDraft: value, ...markDirty(state) }));
  },
  addPosition: (value) => {
    set((state) => ({ positionsDraft: [...state.positionsDraft, value], ...markDirty(state) }));
  },
  updatePosition: (positionId, patch) => {
    set((state) => ({
      positionsDraft: state.positionsDraft.map((position) =>
        position.position_id === positionId ? { ...position, ...patch } : position
      ),
      ...markDirty(state),
    }));
  },
  duplicatePosition: (positionId) => {
    set((state) => {
      const source = state.positionsDraft.find((position) => position.position_id === positionId);
      if (!source) return state;
      const copy: PositionDraft = { ...source, position_id: `${source.position_id}_copy` };
      return {
        positionsDraft: [...state.positionsDraft, copy],
        ...markDirty(state),
      };
    });
  },
  deletePositions: (positionIds) => {
    set((state) => ({
      positionsDraft: state.positionsDraft.filter((position) => !positionIds.includes(position.position_id)),
      ...markDirty(state),
    }));
  },
  resetPositions: () => {
    set((state) => ({ positionsDraft: [...defaultPositions], ...markDirty(state) }));
  },

  setScenariosDraft: (value) => {
    set((state) => ({ scenariosDraft: value, ...markDirty(state) }));
  },
  addScenario: (value) => {
    set((state) => ({ scenariosDraft: [...state.scenariosDraft, value], ...markDirty(state) }));
  },
  updateScenario: (scenarioId, patch) => {
    set((state) => ({
      scenariosDraft: state.scenariosDraft.map((scenario) =>
        scenario.scenario_id === scenarioId ? { ...scenario, ...patch } : scenario
      ),
      ...markDirty(state),
    }));
  },
  duplicateScenario: (scenarioId) => {
    set((state) => {
      const source = state.scenariosDraft.find((scenario) => scenario.scenario_id === scenarioId);
      if (!source) return state;
      const copy: ScenarioDraft = { ...source, scenario_id: `${source.scenario_id}_copy` };
      return {
        scenariosDraft: [...state.scenariosDraft, copy],
        ...markDirty(state),
      };
    });
  },
  deleteScenarios: (scenarioIds) => {
    set((state) => ({
      scenariosDraft: state.scenariosDraft.filter((scenario) => !scenarioIds.includes(scenario.scenario_id)),
      ...markDirty(state),
    }));
  },
  normalizeScenarioProbabilities: () => {
    set((state) => {
      const scenarios = state.scenariosDraft;
      const withProbabilities = scenarios.filter(
        (scenario) => scenario.probability !== null && scenario.probability !== undefined
      );
      if (withProbabilities.length === 0) {
        return state;
      }
      const total = withProbabilities.reduce((sum, scenario) => sum + Number(scenario.probability ?? 0), 0);
      if (total <= 0) {
        return state;
      }
      return {
        scenariosDraft: scenarios.map((scenario) => {
          const probability = Number(scenario.probability ?? 0);
          return {
            ...scenario,
            probability: probability / total,
          };
        }),
        ...markDirty(state),
      };
    });
  },

  setLimitsDraft: (value) => {
    set((state) => ({ limitsDraft: value, ...markDirty(state) }));
  },
  clearLimits: () => {
    set((state) => ({ limitsDraft: null, ...markDirty(state) }));
  },

  setRunConfigDraft: (patch) => {
    set((state) => ({ runConfigDraft: { ...state.runConfigDraft, ...patch }, ...markDirty(state) }));
  },

  setClientValidationErrors: (issues) => set({ clientValidationErrors: issues }),
  setRequestValidationErrors: (issues) => set({ requestValidationErrors: issues }),
  clearErrors: () => set({ clientValidationErrors: [], requestValidationErrors: [], lastError: null }),

  setRequestMeta: (meta) => set({ requestMeta: meta }),
  setLastError: (error) => set({ lastError: error }),

  setCalculationResult: (result, meta) => {
    set({
      calculationResult: result,
      requestMeta: meta,
      isDirty: false,
      isCalculating: false,
      runStatus: "Updated just now",
      lastCalculatedAt: Date.now(),
      lastError: null,
      requestValidationErrors: [],
    });
  },
  startCalculation: () => set({ isCalculating: true, runStatus: "Calculating", lastError: null }),
  finishCalculationError: (error, meta) => {
    const hasPreviousResult = Boolean(get().calculationResult);
    set({
      isCalculating: false,
      runStatus: hasPreviousResult ? "Outdated" : "Error",
      lastError: error,
      requestMeta: meta ?? get().requestMeta,
    });
  },

  setSelectedScenarioId: (value) => set({ selectedScenarioId: value }),
  setSelectedContributorMetric: (value) => set({ selectedContributorMetric: value }),

  setShowSettingsDrawer: (value) => set({ showSettingsDrawer: value }),
  setShowDebugDrawer: (value) => set({ showDebugDrawer: value }),

  setGlobalSearchQuery: (value) => set({ globalSearchQuery: value }),
  setPositionsFilterPreset: (value) => set({ positionsFilterPreset: value }),
  setScenariosFilterPreset: (value) => set({ scenariosFilterPreset: value }),

  loadDefaultLimits: (value) => {
    set((state) => ({ limitsDraft: value, ...markDirty(state) }));
  },
  loadDefaultScenarios: (value) => {
    set((state) => ({ scenariosDraft: value, ...markDirty(state) }));
  },
  importPositions: (rows) => {
    set((state) => ({ positionsDraft: rows, ...markDirty(state) }));
  },
  resetDraft: () => {
    set({
      positionsDraft: [...defaultPositions],
      scenariosDraft: [...defaultScenarios],
      limitsDraft: { ...defaultLimits },
      runConfigDraft: { ...defaultRunConfig },
      globalSearchQuery: "",
      positionsFilterPreset: "all",
      scenariosFilterPreset: "all",
      isDirty: true,
      runStatus: "Draft",
    });
  },
}));
