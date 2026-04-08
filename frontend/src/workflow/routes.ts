import { WorkflowStep } from "./workflowTypes";

export const stepToRoute: Record<WorkflowStep, string> = {
  [WorkflowStep.Import]: "/import",
  [WorkflowStep.Validate]: "/validate",
  [WorkflowStep.MarketData]: "/market",
  [WorkflowStep.Configure]: "/configure",
  [WorkflowStep.CalcRun]: "/run",
  [WorkflowStep.Results]: "/dashboard",
  [WorkflowStep.Stress]: "/stress",
  [WorkflowStep.Limits]: "/limits",
  [WorkflowStep.Margin]: "/margin",
  [WorkflowStep.Export]: "/export",
  [WorkflowStep.PostActions]: "/actions",
};

