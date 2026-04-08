export enum WorkflowStep {
  Import = "S1_IMPORT",
  Validate = "S2_VALIDATE",
  MarketData = "S3_MARKET",
  Configure = "S4_CONFIG",
  CalcRun = "S5_CALC",
  Results = "S6_RESULTS",
  Stress = "S7_STRESS",
  Limits = "S8_LIMITS",
  Margin = "S9_MARGIN",
  Export = "S10_EXPORT",
  PostActions = "S11_POST",
}

export type StepStatus = "locked" | "active" | "done";

export interface WorkflowState {
  snapshotId?: string;
  validation: {
    criticalErrors: number;
    warnings: number;
    acknowledged: boolean;
  };
  marketData: {
    missingFactors: number;
    status: "idle" | "loading" | "ready";
  };
  calcConfig: {
    selectedMetrics: string[];
    params: Record<string, any>;
    marginEnabled: boolean;
  };
  calcRun: {
    calcRunId?: string;
    status: "idle" | "running" | "success" | "error";
    startedAt?: string;
    finishedAt?: string;
  };
  completedSteps: WorkflowStep[];
}

export const initialWorkflowState: WorkflowState = {
  validation: { criticalErrors: 0, warnings: 0, acknowledged: false },
  marketData: { missingFactors: 0, status: "idle" },
  calcConfig: { selectedMetrics: [], params: {}, marginEnabled: false },
  calcRun: { status: "idle" },
  completedSteps: [],
};

