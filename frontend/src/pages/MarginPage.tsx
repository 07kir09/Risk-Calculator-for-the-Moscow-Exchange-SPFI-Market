import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

export default function MarginPage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const m = dataState.results.metrics;

  useEffect(() => {
    if (m) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Margin });
  }, [m, dispatch]);

  if (!wf.calcConfig.marginEnabled) {
    return (
      <Card>
        <h1 className="pageTitle">Шаг 9. Маржа и капитал</h1>
        <p className="pageHint">Этот шаг доступен только если вы включили «Маржа/капитал» на шаге настройки расчёта.</p>
        <Button variant="secondary" onClick={() => nav("/configure")}>Открыть настройки</Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 9. Маржа и капитал</h1>
          <p className="pageHint">Оценка требований по обеспечению (маржа) и капитала. В демо‑режиме методика упрощена.</p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/dashboard")}>Назад: панель</Button>
          <Button variant="secondary" onClick={() => nav("/export")}>Перейти к экспорту</Button>
        </div>
      </div>

      {!m ? (
        <Card>
          <div className="pageEmptyState">
            <div className="badge warn">Нет результатов. Сначала запустите расчёт.</div>
            <div className="pageEmptyActions">
              <Button onClick={() => nav("/dashboard")}>Перейти к результатам</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="compactGrid pageSection--tight">
          <Card>
            <div className="cardTitle">Initial Margin</div>
            <div className="cardSubtitle">Залог “на плохое движение” до закрытия позиции.</div>
            <div className="kpiValue kpiValue--sm kpiValue--mono">{m.initial_margin ?? "—"}</div>
          </Card>
          <Card>
            <div className="cardTitle">Variation Margin</div>
            <div className="cardSubtitle">Переоценка (MtM): прибыль/убыток деньгами.</div>
            <div className="kpiValue kpiValue--sm kpiValue--mono">{m.variation_margin ?? "—"}</div>
          </Card>
          <Card>
            <div className="cardTitle">Capital</div>
            <div className="cardSubtitle">Оценка капитала под риск (демо).</div>
            <div className="kpiValue kpiValue--sm kpiValue--mono">{m.capital ?? "—"}</div>
          </Card>
        </div>
      )}
    </Card>
  );
}
