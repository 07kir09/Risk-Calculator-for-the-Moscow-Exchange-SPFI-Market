import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { WorkflowStep } from "../workflow/workflowTypes";
import { isStepAvailable, useWorkflow } from "../workflow/workflowStore";
import { orderedSteps } from "../workflow/order";
import { stepTitle } from "../workflow/labels";
import { stepToRoute } from "../workflow/routes";

function firstIncompleteRequiredStep(state: ReturnType<typeof useWorkflow>["state"]): WorkflowStep {
  for (const step of orderedSteps) {
    if (step === WorkflowStep.Margin && !state.calcConfig.marginEnabled) continue;
    if (!state.completedSteps.includes(step)) return step;
  }
  return WorkflowStep.Results;
}

export default function GateRoute({ requiredStep, children }: { requiredStep: WorkflowStep; children: ReactNode }) {
  const { state } = useWorkflow();
  const location = useLocation();
  if (!isStepAvailable(state, requiredStep)) {
    const needed = firstIncompleteRequiredStep(state);
    const target = stepToRoute[needed] ?? "/import";
    return (
      <Navigate
        to={target}
        state={{
          from: location.pathname,
          blocked: requiredStep,
          needed,
          reason: `Чтобы открыть этот раздел, сначала завершите: ${stepTitle[needed]}`,
        }}
        replace
      />
    );
  }
  return <>{children}</>;
}
