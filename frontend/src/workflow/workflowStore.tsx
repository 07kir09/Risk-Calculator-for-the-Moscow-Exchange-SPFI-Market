import { createContext, useContext, useEffect, useReducer } from "react";
import { WorkflowState, initialWorkflowState, WorkflowStep } from "./workflowTypes";
import { orderedSteps } from "./order";

type Action =
  | { type: "SET_SNAPSHOT"; snapshotId: string }
  | { type: "SET_VALIDATION"; criticalErrors: number; warnings: number; acknowledged: boolean }
  | { type: "SET_MARKET_STATUS"; missingFactors: number; status: "idle" | "loading" | "ready" }
  | { type: "SET_CALC_CONFIG"; selectedMetrics: string[]; params: Record<string, any>; marginEnabled: boolean }
  | { type: "SET_CALC_RUN"; calcRunId?: string; status: "idle" | "running" | "success" | "error"; startedAt?: string; finishedAt?: string }
  | { type: "COMPLETE_STEP"; step: WorkflowStep }
  | { type: "RESET_DOWNSTREAM"; fromStep: WorkflowStep }
  | { type: "RESET_ALL" };

const STORAGE_KEY = "workflow_state_v1";

function reducer(state: WorkflowState, action: Action): WorkflowState {
  switch (action.type) {
    case "SET_SNAPSHOT":
      return { ...state, snapshotId: action.snapshotId };
    case "SET_VALIDATION":
      return { ...state, validation: { criticalErrors: action.criticalErrors, warnings: action.warnings, acknowledged: action.acknowledged } };
    case "SET_MARKET_STATUS":
      return { ...state, marketData: { missingFactors: action.missingFactors, status: action.status } };
    case "SET_CALC_CONFIG":
      return { ...state, calcConfig: { selectedMetrics: action.selectedMetrics, params: action.params, marginEnabled: action.marginEnabled } };
    case "SET_CALC_RUN":
      return { ...state, calcRun: { calcRunId: action.calcRunId, status: action.status, startedAt: action.startedAt, finishedAt: action.finishedAt } };
    case "COMPLETE_STEP":
      return state.completedSteps.includes(action.step)
        ? state
        : { ...state, completedSteps: [...state.completedSteps, action.step] };
    case "RESET_DOWNSTREAM": {
      const idx = orderedSteps.indexOf(action.fromStep);
      const keepSteps = orderedSteps.slice(0, idx + 1);
      const next: WorkflowState = {
        ...state,
        completedSteps: state.completedSteps.filter((s) => keepSteps.includes(s)),
      };

      if (action.fromStep === WorkflowStep.Import) {
        next.validation = { criticalErrors: 0, warnings: 0, acknowledged: false };
        next.marketData = { missingFactors: 0, status: "idle" };
        next.calcConfig = { selectedMetrics: [], params: {}, marginEnabled: false };
        next.calcRun = { status: "idle" };
        return next;
      }

      if (action.fromStep === WorkflowStep.Validate) {
        next.marketData = { missingFactors: 0, status: "idle" };
        next.calcConfig = { selectedMetrics: [], params: {}, marginEnabled: false };
        next.calcRun = { status: "idle" };
        return next;
      }

      if (action.fromStep === WorkflowStep.MarketData) {
        next.calcConfig = { selectedMetrics: [], params: {}, marginEnabled: false };
        next.calcRun = { status: "idle" };
        return next;
      }

      if (action.fromStep === WorkflowStep.Configure) {
        next.calcRun = { status: "idle" };
        return next;
      }

      if (action.fromStep === WorkflowStep.CalcRun) {
        next.calcRun = { status: "idle" };
        return next;
      }

      next.calcRun = { status: "idle" };
      return next;
    }
    case "RESET_ALL":
      return initialWorkflowState;
    default:
      return state;
  }
}

const WorkflowContext = createContext<{ state: WorkflowState; dispatch: React.Dispatch<Action> } | null>(null);

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialWorkflowState, (init) => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return init;
    try {
      return { ...init, ...JSON.parse(saved) };
    } catch {
      return init;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("WorkflowProvider: localStorage quota exceeded, skipping workflow persistence", error);
    }
  }, [state]);

  return <WorkflowContext.Provider value={{ state, dispatch }}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within WorkflowProvider");
  return ctx;
}

export function isStepAvailable(state: WorkflowState, step: WorkflowStep): boolean {
  const done = (s: WorkflowStep) => state.completedSteps.includes(s);
  switch (step) {
    case WorkflowStep.Import:
      return true;
    case WorkflowStep.Validate:
      return done(WorkflowStep.Import);
    case WorkflowStep.MarketData:
      return done(WorkflowStep.Validate);
    case WorkflowStep.Configure:
      return done(WorkflowStep.MarketData);
    case WorkflowStep.CalcRun:
      return done(WorkflowStep.Configure);
    case WorkflowStep.Results:
      return done(WorkflowStep.CalcRun);
    case WorkflowStep.Stress:
    case WorkflowStep.Limits:
    case WorkflowStep.Export:
    case WorkflowStep.PostActions:
      return done(WorkflowStep.Results);
    case WorkflowStep.Margin:
      return done(WorkflowStep.Results) && state.calcConfig.marginEnabled;
    default:
      return false;
  }
}
