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
  WorkflowStep.CalcRun,
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
    <div className="workflowRailList" aria-label="Прогресс выполнения шагов">
      {steps.map((s, idx) => (
        <button
          key={s.step}
          type="button"
          className={`workflowRailItem workflowRailItem--${s.status}`}
          disabled={s.status === "locked"}
          title={s.status === "locked" ? "Сначала завершите предыдущие шаги" : "Открыть шаг"}
          onClick={() => nav(stepToRoute[s.step])}
        >
          <span className="workflowRailIndex">{s.status === "done" ? "✓" : idx + 1}</span>
          <span className="workflowRailText">
            <span className="workflowRailLabel">{s.label}</span>
            <span className="workflowRailState">
              {s.status === "done" ? "Готово" : s.status === "active" ? "Сейчас" : "Недоступно"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
