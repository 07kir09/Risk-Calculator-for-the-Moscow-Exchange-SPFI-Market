import { useNavigate } from "react-router-dom";
import { orderedSteps } from "../workflow/order";
import { isStepAvailable, useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import Button from "./Button";
import { stepToRoute } from "../workflow/routes";

export default function NextStepBanner() {
  const { state } = useWorkflow();
  const nav = useNavigate();
  const nextStep =
    orderedSteps.find((s) => {
      if (s === WorkflowStep.Margin && !state.calcConfig.marginEnabled) return false;
      return !state.completedSteps.includes(s);
    }) || WorkflowStep.Results;
  const available = isStepAvailable(state, nextStep);
  const route = stepToRoute[nextStep];
  const messageMap: Record<WorkflowStep, string> = {
    [WorkflowStep.Import]: "Шаг 1: загрузите сделки (CSV или API).",
    [WorkflowStep.Validate]: "Шаг 2: проверьте данные. Критические ошибки нужно исправить.",
    [WorkflowStep.MarketData]: "Шаг 3: свяжите сделки с рыночными данными (кривые/FX/вола).",
    [WorkflowStep.Configure]: "Шаг 4: выберите метрики и параметры расчёта.",
    [WorkflowStep.CalcRun]: "Шаг 5: запустите расчёт портфеля.",
    [WorkflowStep.Results]: "Шаг 6: откройте панель — там итог по риску.",
    [WorkflowStep.Stress]: "Шаг 7: перейдите к стресс-сценариям после результатов.",
    [WorkflowStep.Limits]: "Шаг 8: проверьте лимиты после результатов.",
    [WorkflowStep.Margin]: "Шаг 9: маржа/капитал доступны после включения в настройках.",
    [WorkflowStep.Export]: "Шаг 10: выгрузите отчёт после расчёта.",
    [WorkflowStep.PostActions]: "Шаг 11: дополнительные действия после результатов.",
  };
  return (
    <div className="card">
      <div className="pageHeader">
        <div className="pageHeaderText">
          <div className="cardTitle">Что дальше</div>
          <div className="cardSubtitle">
            {messageMap[nextStep]} {!available && <span className="textMuted">(сначала завершите предыдущие шаги)</span>}
          </div>
        </div>
        <div className="pageActions">
          <Button variant={available ? "primary" : "secondary"} disabled={!available} onClick={() => nav(route)}>
            Открыть шаг
          </Button>
        </div>
      </div>
    </div>
  );
}
