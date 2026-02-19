import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import KpiCard from "../ui/KpiCard";
import PageHeader from "../ui/PageHeader";
import Section from "../ui/Section";
import SegmentedControl from "../ui/SegmentedControl";
import StatePanel from "../ui/StatePanel";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { orderedSteps } from "../workflow/order";
import { stepToRoute } from "../workflow/routes";
import { WorkflowStep } from "../workflow/workflowTypes";
import { stepShortLabel } from "../workflow/labels";
import { formatNumber } from "../utils/format";
import { loadRunHistory } from "../lib/scenarios";

function findNextStep(state: ReturnType<typeof useWorkflow>["state"]): WorkflowStep {
  for (const step of orderedSteps) {
    if (step === WorkflowStep.Margin && !state.calcConfig.marginEnabled) continue;
    if (!state.completedSteps.includes(step)) return step;
  }
  return WorkflowStep.Results;
}

export default function OverviewPage() {
  const navigate = useNavigate();
  const { state: dataState } = useAppData();
  const { state: workflowState } = useWorkflow();
  const [mode, setMode] = useState<"portfolio" | "single">("portfolio");

  const metrics = dataState.results.metrics;
  const positions = dataState.portfolio.positions;
  const nextStep = useMemo(() => findNextStep(workflowState), [workflowState]);
  const history = useMemo(() => loadRunHistory(), []);
  const latestRun = history[0];

  const statusTone = positions.length === 0 ? "warning" : metrics ? "success" : "info";
  const statusTitle = positions.length === 0 ? "Начните с загрузки портфеля" : metrics ? "Результаты готовы" : "Сессия подготовлена";

  return (
    <Card>
      <PageHeader
        kicker="Home / Overview"
        title="Risk Calculator for MOEX SPFI"
        subtitle="Единая точка входа: выберите режим расчёта, проверьте готовность, запустите и сразу получите KPI по риску."
        actions={
          <>
            <Button onClick={() => navigate(positions.length === 0 ? "/import" : `/run?mode=${mode}`)}>
              {positions.length === 0 ? "Быстрый старт" : "Перейти к расчёту"}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/results")}>Открыть результаты</Button>
          </>
        }
      />

      <Section
        title="Quick Start"
        helper="Один главный сценарий: загрузите данные -> подтвердите настройки -> получите KPI."
        actions={
          <SegmentedControl
            ariaLabel="Режим запуска"
            value={mode}
            onChange={(value) => setMode(value as "portfolio" | "single")}
            options={[
              { value: "portfolio", label: "Portfolio" },
              { value: "single", label: "Single instrument", disabled: positions.length === 0 },
            ]}
          />
        }
      >
        <StatePanel
          tone={statusTone}
          title={statusTitle}
          description={
            positions.length === 0
              ? "Загрузите CSV или демо-портфель. После этого мастер откроет остальные этапы автоматически."
              : `Следующий шаг: ${stepShortLabel[nextStep]}. Текущий режим запуска: ${mode}.`
          }
          action={
            <Button variant="secondary" onClick={() => navigate(stepToRoute[nextStep] ?? "/import")}>
              Открыть шаг
            </Button>
          }
        />
      </Section>

      <Section title="Risk Snapshot" helper="Сводка показывает последнее рассчитанное состояние портфеля.">
        {!metrics ? (
          <StatePanel
            tone="info"
            title="Пока нет расчёта"
            description="После запуска здесь появятся ключевые метрики: PV, VaR, ES, LC VaR, margin."
            action={<Button variant="secondary" onClick={() => navigate("/run")}>Перейти к запуску</Button>}
          />
        ) : (
          <div className="grid" style={{ marginTop: 8 }}>
            <KpiCard label="Portfolio value" value={formatNumber(metrics.base_value)} helper={metrics.base_currency ?? "RUB"} />
            <KpiCard label="VaR" value={metrics.var_hist == null ? "—" : formatNumber(metrics.var_hist)} helper={`CL ${Number(metrics.confidence_level ?? 0.99).toFixed(4)}`} />
            <KpiCard label="ES" value={metrics.es_hist == null ? "—" : formatNumber(metrics.es_hist)} helper="Tail loss" />
            <KpiCard label="LC VaR" value={metrics.lc_var == null ? "—" : formatNumber(metrics.lc_var)} helper={metrics.liquidity_model ?? "liquidity model"} />
          </div>
        )}
      </Section>

      <Section
        title="Recent Runs"
        helper="Сохранённые локально запуски для быстрого сравнения сценариев."
        actions={<Button variant="secondary" onClick={() => navigate("/scenarios")}>Открыть сценарии</Button>}
      >
        {latestRun ? (
          <div className="row wrap" style={{ justifyContent: "space-between", marginTop: 8 }}>
            <div className="stack">
              <div className="cardTitle">{new Date(latestRun.createdAt).toLocaleString("ru-RU")}</div>
              <div className="textMuted">
                Режим: {latestRun.scope}, позиций: {latestRun.positionCount}, валюта: {latestRun.baseCurrency}
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="badge ok">VaR: {latestRun.metrics.var_hist == null ? "—" : formatNumber(latestRun.metrics.var_hist)}</span>
              <span className="badge ok">ES: {latestRun.metrics.es_hist == null ? "—" : formatNumber(latestRun.metrics.es_hist)}</span>
            </div>
          </div>
        ) : (
          <StatePanel
            tone="info"
            title="История запусков пуста"
            description="После первого успешного расчёта здесь появится карточка последнего запуска."
          />
        )}
      </Section>
    </Card>
  );
}
