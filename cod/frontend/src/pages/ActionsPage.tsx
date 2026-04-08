import { useEffect } from "react";
import { Chip } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import { GlassPanel, Reveal, Sparkline, StaggerGroup, StaggerItem } from "../components/rich/RichVisuals";
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
        <Card>
          <div className="pageEmptyState">
            <div className="badge warn">Нет результатов. Сначала запустите расчёт.</div>
            <div className="pageEmptyActions">
              <Button onClick={() => nav("/run")}>Перейти к запуску</Button>
            </div>
          </div>
        </Card>
      ) : (
        <StaggerGroup className="actionCardGrid pageSection--tight">
          <StaggerItem>
            <GlassPanel
              title="What-if"
              subtitle="Изменить объём сделки / добавить позицию / попробовать хедж."
              badge={<Chip color="primary" variant="flat" radius="sm">sandbox</Chip>}
            >
              <Sparkline
                data={[
                  { label: "1", value: 20 },
                  { label: "2", value: 42 },
                  { label: "3", value: 36 },
                  { label: "4", value: 54 },
                ]}
                color="#7da7ff"
                height={88}
              />
              <div className="stack pageSection--tight">
                <div className="textMuted">Поменяйте количество/номинал или добавьте хедж — и пересчитайте метрики “до/после”.</div>
                <Button variant="secondary" onClick={() => nav("/what-if")}>Открыть песочницу</Button>
              </div>
            </GlassPanel>
          </StaggerItem>
          <StaggerItem>
            <GlassPanel
              title="Подсказки по хеджу"
              subtitle="Идеи, как снизить конкретный риск (DV01/Delta/Vega…)."
              badge={<Chip color="success" variant="flat" radius="sm">guided</Chip>}
            >
              <Sparkline
                data={[
                  { label: "1", value: 16 },
                  { label: "2", value: 22 },
                  { label: "3", value: 31 },
                  { label: "4", value: 28 },
                ]}
                color="#6eff8e"
                height={88}
              />
              <div className="stack pageSection--tight">
                <div className="textMuted">Выберите риск → отправьте “идею хеджа” в песочницу → посмотрите эффект.</div>
                <Button variant="secondary" onClick={() => nav("/hedge")}>Открыть подсказки</Button>
              </div>
            </GlassPanel>
          </StaggerItem>
          <StaggerItem>
            <GlassPanel
              title="План B"
              subtitle="Чек‑лист: что делать при превышениях лимитов и стресс‑убытках."
              badge={<Chip color="warning" variant="flat" radius="sm">fallback</Chip>}
            >
              <Sparkline
                data={[
                  { label: "1", value: 12 },
                  { label: "2", value: 18 },
                  { label: "3", value: 26 },
                  { label: "4", value: 41 },
                ]}
                color="#ffb86a"
                height={88}
              />
              <div className="stack pageSection--tight">
                <div className="textMuted">Подходит для пользователя без опыта: простые шаги и быстрые кнопки.</div>
                <Button variant="secondary" onClick={() => nav("/plan-b")}>Открыть План B</Button>
              </div>
            </GlassPanel>
          </StaggerItem>
        </StaggerGroup>
      )}
    </Card>
  );
}
