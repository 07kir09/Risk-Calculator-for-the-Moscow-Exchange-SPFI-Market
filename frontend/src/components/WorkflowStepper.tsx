import { WorkflowStep } from "../workflow/workflowTypes";
import { useWorkflow, isStepAvailable } from "../workflow/workflowStore";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { stepShortLabel } from "../workflow/labels";
import { stepToRoute } from "../workflow/routes";

const order: WorkflowStep[] = [
  WorkflowStep.Import,
  WorkflowStep.Validate,
  WorkflowStep.MarketData,
  WorkflowStep.Configure,
  WorkflowStep.Results,
];

export default function WorkflowStepper() {
  const { state } = useWorkflow();
  const nav = useNavigate();
  const steps = useMemo(
    () =>
      order.map((s) => ({
        step: s,
        label: stepShortLabel[s],
        status: state.completedSteps.includes(s) ? "done" : isStepAvailable(state, s) ? "active" : "locked",
      })),
    [state]
  );

  return (
    <div className="workflowChainWrap" aria-label="Прогресс выполнения шагов">
      <div className="workflowChain">
        {steps.map((s, idx) => (
          <div key={s.step} className="workflowChainItem">
            <button
              type="button"
              className={`workflowNode ${s.status}`}
              disabled={s.status === "locked"}
              title={s.status === "locked" ? "Сначала завершите предыдущие шаги" : "Открыть шаг"}
              onClick={() => nav(stepToRoute[s.step])}
            >
              <div className="workflowNodeCircle">{s.status === "done" ? "OK" : idx + 1}</div>
              <div className="workflowNodeLabel">{s.label}</div>
              <div className="workflowNodeState">{s.status === "done" ? "Готово" : s.status === "active" ? "Сейчас" : "Недоступно"}</div>
            </button>
            {idx < steps.length - 1 && (
              <div className={`workflowConnector workflowConnector--${s.status}`} aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
