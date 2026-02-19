import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import StatePanel from "../ui/StatePanel";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

export default function ActionsPage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { dispatch } = useWorkflow();

  const hasResults = Boolean(dataState.results.metrics);

  useEffect(() => {
    if (hasResults) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.PostActions });
  }, [hasResults, dispatch]);

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 11. What‑if / Хедж‑подсказки / План B</h1>
          <p className="pageHint">
            Это “песочница”: попробуйте изменить портфель или добавить хедж — и сравните риск “до/после”. Здесь же — типовые планы действий при превышениях.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/dashboard")}>Назад: панель</Button>
        </div>
      </div>

      {!hasResults ? (
        <StatePanel
          tone="warning"
          title="Нет результатов для пост-аналитики"
          description="What-if, хедж и План B опираются на рассчитанные метрики. Сначала запустите расчёт."
          action={<Button onClick={() => nav("/run")}>Перейти к запуску</Button>}
        />
      ) : (
        <div className="grid" style={{ marginTop: 12 }}>
          <Card>
            <div className="cardTitle">What‑if: “что если”</div>
            <div className="cardSubtitle">Изменить объём сделки / добавить позицию / попробовать хедж.</div>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="textMuted">Поменяйте количество/номинал или добавьте хедж — и пересчитайте метрики “до/после”.</div>
              <Button variant="secondary" onClick={() => nav("/what-if")}>Открыть песочницу</Button>
            </div>
          </Card>
          <Card>
            <div className="cardTitle">Подсказки по хеджу</div>
            <div className="cardSubtitle">Идеи, как снизить конкретный риск (DV01/Delta/Vega…).</div>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="textMuted">Выберите риск → отправьте “идею хеджа” в песочницу → посмотрите эффект.</div>
              <Button variant="secondary" onClick={() => nav("/hedge")}>Открыть подсказки</Button>
            </div>
          </Card>
          <Card>
            <div className="cardTitle">План действий (План B)</div>
            <div className="cardSubtitle">Чек‑лист: что делать при превышениях лимитов/стресс‑убытках.</div>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="textMuted">Подходит для пользователя без опыта: простые шаги и быстрые кнопки.</div>
              <Button variant="secondary" onClick={() => nav("/plan-b")}>Открыть План B</Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
