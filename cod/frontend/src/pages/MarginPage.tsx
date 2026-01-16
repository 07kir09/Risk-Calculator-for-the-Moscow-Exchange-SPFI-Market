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
          <div className="badge warn">Нет результатов. Сначала запустите расчёт.</div>
          <Button onClick={() => nav("/run")}>Перейти к запуску</Button>
        </Card>
      ) : (
        <div className="grid" style={{ marginTop: 12 }}>
          <Card>
            <div className="cardTitle">Initial Margin</div>
            <div className="cardSubtitle">Залог “на плохое движение” до закрытия позиции.</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 10 }}>{m.initial_margin ?? "—"}</div>
          </Card>
          <Card>
            <div className="cardTitle">Variation Margin</div>
            <div className="cardSubtitle">Переоценка (MtM): прибыль/убыток деньгами.</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 10 }}>{m.variation_margin ?? "—"}</div>
          </Card>
          <Card>
            <div className="cardTitle">Capital</div>
            <div className="cardSubtitle">Оценка капитала под риск (демо).</div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 10 }}>{m.capital ?? "—"}</div>
          </Card>
        </div>
      )}
    </Card>
  );
}

