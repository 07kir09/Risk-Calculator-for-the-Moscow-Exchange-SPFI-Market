import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import StatePanel from "../ui/StatePanel";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";

export default function LimitsPage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { dispatch } = useWorkflow();
  const m = dataState.results.metrics;
  const limits = m?.limits || [];

  useEffect(() => {
    if (m) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Limits });
  }, [m, dispatch]);

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 8. Лимиты</h1>
          <p className="pageHint">Сравниваем «факт» с установленными лимитами и показываем превышения.</p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/dashboard")}>Назад: панель</Button>
          <Button variant="secondary" onClick={() => nav("/stress")}>Открыть стрессы</Button>
          <Button variant="secondary" onClick={() => nav("/hedge")}>Хедж‑подсказки</Button>
        </div>
      </div>

      {!m ? (
        <StatePanel
          tone="warning"
          title="Лимиты пока недоступны"
          description="Сначала выполните расчёт портфеля. После этого появится сравнение fact vs limit."
          action={<Button onClick={() => nav("/run")}>Перейти к запуску</Button>}
        />
      ) : (
        <Card>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="cardTitle">Таблица лимитов</div>
              <div className="cardSubtitle">Клик по строке (в будущих версиях) откроет вклад сделок.</div>
            </div>
            <Button variant="secondary" onClick={() => nav("/export")}>Экспорт</Button>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table sticky">
              <thead>
                <tr>
                  <th>Метрика</th>
                  <th>Факт</th>
                  <th>Лимит</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {limits.map(([metric, value, limit, breached]) => (
                  <tr key={metric}>
                    <td>{metric}</td>
                    <td title={String(value)}>{formatNumber(value)}</td>
                    <td>{formatNumber(limit)}</td>
                    <td>
                      <span className={breached ? "badge danger" : "badge ok"}>{breached ? "Превышен" : "Ок"}</span>
                    </td>
                  </tr>
                ))}
                {limits.length === 0 && (
                  <tr>
                    <td colSpan={4} className="textMuted">Лимитов нет (или не переданы при расчёте).</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Card>
  );
}
