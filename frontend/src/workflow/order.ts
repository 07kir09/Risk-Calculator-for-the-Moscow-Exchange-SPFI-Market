import { WorkflowStep } from "./workflowTypes";

export const orderedSteps: WorkflowStep[] = [
  WorkflowStep.Import,
  WorkflowStep.Validate,
  WorkflowStep.MarketData,
  WorkflowStep.Configure,
  WorkflowStep.Results,
  WorkflowStep.Stress,
  WorkflowStep.Limits,
  WorkflowStep.Export,
];
