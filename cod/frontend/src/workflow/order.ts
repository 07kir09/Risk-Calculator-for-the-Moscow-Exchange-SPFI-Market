import { WorkflowStep } from "./workflowTypes";

export const orderedSteps: WorkflowStep[] = [
  WorkflowStep.Import,
  WorkflowStep.Validate,
  WorkflowStep.MarketData,
  WorkflowStep.Configure,
  WorkflowStep.CalcRun,
  WorkflowStep.Results,
  WorkflowStep.Stress,
  WorkflowStep.Limits,
  WorkflowStep.Margin,
  WorkflowStep.Export,
  WorkflowStep.PostActions,
];

