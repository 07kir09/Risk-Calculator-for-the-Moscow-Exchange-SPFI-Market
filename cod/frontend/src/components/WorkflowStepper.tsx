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
  const steps = useMemo(() => order.map((s) => ({
    step: s,
    label: stepShortLabel[s],
    status: state.completedSteps.includes(s) ? "done" : isStepAvailable(state, s) ? "active" : "locked",
  })), [state]);
  return (
    <div className="stepper">
      {steps.map((s, idx) => (
        <button
          key={s.step}
          type="button"
          className={`step ${s.status}`}
          disabled={s.status === "locked"}
          title={s.status === "locked" ? "Сначала завершите предыдущие шаги" : "Открыть шаг"}
          onClick={() => nav(stepToRoute[s.step])}
          style={{ textAlign: "left" }}
        >
          <div className="stepRow">
            <div className="stepIndex">{idx + 1}</div>
            <div className="stepTitle">{s.label}</div>
          </div>
          <div className="stepDesc">{s.status === "done" ? "Готово" : s.status === "active" ? "Сейчас" : "Недоступно"}</div>
        </button>
      ))}
    </div>
  );
}
