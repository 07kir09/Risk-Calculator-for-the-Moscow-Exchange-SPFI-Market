import { useEffect, useMemo } from "react";
import { Chip } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import AppTable from "../components/AppTable";
import Button from "../components/Button";
import Card from "../ui/Card";
import {
  CompareBarsChart,
  DonutGauge,
  GlassPanel,
  Reveal,
  StaggerGroup,
  StaggerItem,
} from "../components/rich/RichVisuals";
import { ChartInsights } from "../components/rich/ChartInsights";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { buildLimitComparisonInsights, buildLimitOverviewInsights } from "../lib/chartInsights";

export default function LimitsPage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { dispatch } = useWorkflow();
  const metrics = dataState.results.metrics;
  const limits = metrics?.limits || [];

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Limits });
  }, [dispatch, metrics]);

  const breachedCount = useMemo(() => limits.filter(([, , , breached]) => breached).length, [limits]);
  const limitBars = useMemo(
    () =>
      limits.map(([metric, value, limit, breached]) => {
        const utilization = limit ? Math.abs((value / limit) * 100) : 0;
        return {
          label: String(metric),
          value: utilization,
          tone: breached ? "negative" as const : utilization > 80 ? "neutral" as const : "positive" as const,
        };
      }),
    [limits]
  );
  const overallUtilization = useMemo(
    () => (limitBars.length ? Math.max(...limitBars.map((item) => item.value), 0) : 0),
    [limitBars]
  );
  const overallLimitInsights = useMemo(
    () => buildLimitOverviewInsights({ limits, overallUtilization }),
    [limits, overallUtilization]
  );
  const comparisonInsights = useMemo(
    () => buildLimitComparisonInsights({ limits }),
    [limits]
  );

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Лимиты</h1>
          <p className="pageHint">Здесь сравнивается факт с лимитом. Главное — быстро понять, что превышено и насколько это критично.</p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/dashboard")}>
            Назад
          </Button>
          <Chip color={breachedCount > 0 ? "danger" : "success"} variant="flat" radius="sm">
            {breachedCount > 0 ? `Превышений: ${breachedCount}` : "Все лимиты в норме"}
          </Chip>
        </div>
      </div>

      {!metrics ? (
        <Card>
          <div className="textMuted">Результатов ещё нет. Сначала запустите расчёт.</div>
          <div className="runActionRow">
            <Button onClick={() => nav("/dashboard")}>К результатам</Button>
          </div>
        </Card>
      ) : (
        <div className="runLayout">
          <div className="runMain">
            <StaggerGroup className="visualSplitPanel">
              <StaggerItem>
                <GlassPanel
                  title="Общая загрузка лимитов"
                  subtitle="Radial gauge нужен для одного ответа: насколько близко мы к жёсткой границе."
                  badge={<Chip color={breachedCount > 0 ? "danger" : overallUtilization > 80 ? "warning" : "success"} variant="flat" radius="sm">{Math.round(overallUtilization)}%</Chip>}
                >
                  <DonutGauge
                    value={overallUtilization}
                    label="limit load"
                    subtitle={breachedCount > 0 ? "Есть прямые breach-события." : "Пока всё находится в рабочей зоне."}
                    color={breachedCount > 0 ? "#ff7777" : overallUtilization > 80 ? "#ffb86a" : "#6eff8e"}
                  />
                  <ChartInsights items={overallLimitInsights} />
                </GlassPanel>
              </StaggerItem>
              <StaggerItem>
                <GlassPanel title="Сравнение по метрикам" subtitle="Бар-чарт быстрее таблицы показывает, какая метрика ближе к красной зоне.">
                  <CompareBarsChart data={limitBars} height={260} />
                  <ChartInsights items={comparisonInsights} />
                </GlassPanel>
              </StaggerItem>
            </StaggerGroup>

            <Reveal delay={0.08}>
              <Card>
              <div className="cardTitle">Факт против лимита</div>
              <div className="cardSubtitle">Статус виден сразу, а таблица остаётся компактной и читаемой.</div>

              <AppTable
                ariaLabel="Таблица лимитов"
                headers={["Метрика", "Факт", "Лимит", "Использование", "Статус"]}
                rows={limits.map(([metric, value, limit, breached]) => {
                  const utilization = limit ? Math.abs((value / limit) * 100) : 0;
                  return {
                    key: metric,
                    cells: [
                      metric,
                      formatNumber(value, 2),
                      formatNumber(limit, 2),
                      `${formatNumber(utilization, 1)}%`,
                      <Chip key={`${metric}-status`} color={breached ? "danger" : utilization > 80 ? "warning" : "success"} variant="flat" radius="sm">
                        {breached ? "Превышен" : utilization > 80 ? "Близко к лимиту" : "Ок"}
                      </Chip>,
                    ],
                  };
                })}
                emptyContent="Лимиты не были переданы в расчёт."
              />
              </Card>
            </Reveal>
          </div>

          <aside className="importAside">
            <Card>
              <div className="cardTitle">Что делать дальше</div>
              <div className="cardSubtitle">Если есть превышения, переходите к стрессам или what-if, чтобы понять источник проблемы.</div>
              <div className="runActionRow">
                <Button variant="secondary" onClick={() => nav("/stress")}>К стрессам</Button>
                <Button variant="secondary" onClick={() => nav("/actions")}>К what-if</Button>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </Card>
  );
}
