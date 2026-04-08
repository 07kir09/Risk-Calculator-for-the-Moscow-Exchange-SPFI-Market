import { useMemo, useState } from "react";
import { Chip, Progress } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import {
  CompareBarsChart,
  DonutGauge,
  GlassPanel,
  MetricHero,
  Reveal,
  Sparkline,
  StaggerGroup,
  StaggerItem,
} from "../components/rich/RichVisuals";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { runRiskCalculation } from "../api/services/risk";

export default function RunPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const [errorText, setErrorText] = useState<string | null>(null);

  const positions = dataState.portfolio.positions;
  const scenarios = dataState.scenarios;
  const selectedMetrics = wf.calcConfig.selectedMetrics;
  const alpha = Number(wf.calcConfig.params?.alpha ?? 0.99);
  const horizonDays = Number(wf.calcConfig.params?.horizonDays ?? 10);
  const parametricTailModel = String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher");
  const baseCurrency = String(wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase();
  const fxRates = (wf.calcConfig.params?.fxRates as Record<string, number> | undefined) ?? undefined;
  const liquidityModel = String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value");

  const canRun = useMemo(
    () =>
      positions.length > 0 &&
      wf.validation.criticalErrors === 0 &&
      wf.marketData.status === "ready" &&
      wf.marketData.missingFactors === 0 &&
      selectedMetrics.length > 0 &&
      Number.isFinite(alpha) &&
      Number.isFinite(horizonDays) &&
      horizonDays >= 1 &&
      /^[A-Z]{3}$/.test(baseCurrency),
    [
      alpha,
      baseCurrency,
      horizonDays,
      positions.length,
      selectedMetrics.length,
      wf.marketData.missingFactors,
      wf.marketData.status,
      wf.validation.criticalErrors,
    ]
  );

  const isRunning = wf.calcRun.status === "running";
  const readiness = canRun ? 100 : Math.round(
    [
      positions.length > 0,
      wf.validation.criticalErrors === 0,
      wf.marketData.status === "ready" && wf.marketData.missingFactors === 0,
      selectedMetrics.length > 0,
    ].filter(Boolean).length * 25
  );
  const readinessBreakdown = useMemo(
    () => [
      { label: "Портфель", value: positions.length > 0 ? 100 : 8, tone: positions.length > 0 ? "positive" as const : "negative" as const },
      { label: "Валидация", value: wf.validation.criticalErrors === 0 ? 100 : 18, tone: wf.validation.criticalErrors === 0 ? "positive" as const : "negative" as const },
      { label: "Market data", value: wf.marketData.status === "ready" && wf.marketData.missingFactors === 0 ? 100 : 22, tone: wf.marketData.status === "ready" ? "neutral" as const : "negative" as const },
      { label: "Метрики", value: selectedMetrics.length > 0 ? 100 : 12, tone: selectedMetrics.length > 0 ? "positive" as const : "negative" as const },
    ],
    [positions.length, selectedMetrics.length, wf.marketData.missingFactors, wf.marketData.status, wf.validation.criticalErrors]
  );
  const readinessSpark = useMemo(
    () => readinessBreakdown.map((item, index) => ({ label: `${index + 1}`, value: item.value })),
    [readinessBreakdown]
  );

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Запуск расчёта</h1>
          <p className="pageHint">
            На этом шаге не должно быть лишних решений. Здесь только финальная сводка, статус готовности и кнопка запуска.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/configure")}>
            Назад к настройкам
          </Button>
        </div>
      </div>

      <div className="runLayout">
        <div className="runMain">
          <StaggerGroup className="dashboardHeroGrid">
            <StaggerItem>
              <MetricHero
                label="Готовность запуска"
                value={readiness}
                suffix="%"
                tone={canRun ? "success" : "warning"}
                hint={canRun ? "run-ready" : "needs input"}
                chart={<Sparkline data={readinessSpark} color={canRun ? "#6eff8e" : "#ffb86a"} />}
              />
            </StaggerItem>
            <StaggerItem>
              <MetricHero
                label="Сценарный набор"
                value={scenarios.length}
                tone="default"
                hint={`${selectedMetrics.length} метрик`}
                chart={
                  <div className="heroInlineStats">
                    <div className="heroInlineStat">
                      <span>alpha</span>
                      <strong>{alpha}</strong>
                    </div>
                    <div className="heroInlineStat">
                      <span>horizon</span>
                      <strong>{horizonDays}</strong>
                    </div>
                    <div className="heroInlineStat">
                      <span>ccy</span>
                      <strong>{baseCurrency}</strong>
                    </div>
                  </div>
                }
              />
            </StaggerItem>
            <StaggerItem>
              <GlassPanel
                title="Контроль перед запуском"
                subtitle="Radial-gauge показывает финальную уверенность, bar-chart — где именно остались провалы."
                badge={<Chip color={canRun ? "success" : "warning"} variant="flat" radius="sm">{canRun ? "Можно запускать" : "Есть блокеры"}</Chip>}
              >
                <div className="visualSplitPanel">
                  <DonutGauge value={readiness} label="session ready" subtitle="Сессия должна быть на 100%, чтобы запуск не был сюрпризом." />
                  <CompareBarsChart data={readinessBreakdown} height={220} />
                </div>
              </GlassPanel>
            </StaggerItem>
          </StaggerGroup>

          <Reveal delay={0.06}>
            <Card>
            <div className="runSummaryHeader">
              <div>
                <div className="cardTitle">Готовность сессии</div>
                <div className="cardSubtitle">Если шкала не на 100%, расчёт не стартует.</div>
              </div>
              <Chip color={canRun ? "success" : "warning"} variant="flat" radius="sm">
                {canRun ? "Можно запускать" : "Нужна доработка входа"}
              </Chip>
            </div>

            <Progress aria-label="Готовность к запуску" value={readiness} color={canRun ? "success" : "warning"} className="importProgress" />

            <div className="runKpiGrid">
              <div className="importKpiCard">
                <span>Позиции</span>
                <strong>{positions.length}</strong>
              </div>
              <div className="importKpiCard">
                <span>Сценарии</span>
                <strong>{scenarios.length}</strong>
              </div>
              <div className="importKpiCard">
                <span>Метрики</span>
                <strong>{selectedMetrics.length}</strong>
              </div>
            </div>

            {errorText && (
              <Chip color="danger" variant="flat" radius="sm" className="importIssueChip">
                {errorText}
              </Chip>
            )}

            <div className="runActionRow">
              <Button
                disabled={!canRun || isRunning}
                loading={isRunning}
                onClick={async () => {
                  setErrorText(null);
                  dataDispatch({ type: "RESET_RESULTS" });
                  dispatch({ type: "RESET_DOWNSTREAM", fromStep: WorkflowStep.CalcRun });
                  const calcRunId = crypto.randomUUID();
                  dispatch({ type: "SET_CALC_RUN", calcRunId, status: "running", startedAt: new Date().toISOString() });
                  try {
                    const metrics = await runRiskCalculation({
                      positions,
                      scenarios,
                      limits: dataState.limits ?? undefined,
                      alpha,
                      horizonDays,
                      parametricTailModel,
                      baseCurrency,
                      fxRates,
                      liquidityModel,
                      selectedMetrics,
                      marginEnabled: wf.calcConfig.marginEnabled,
                      marketDataSessionId: dataState.marketDataSummary?.session_id,
                    });
                    dataDispatch({ type: "SET_RESULTS", metrics });
                    dispatch({
                      type: "SET_CALC_RUN",
                      calcRunId,
                      status: "success",
                      startedAt: wf.calcRun.startedAt ?? new Date().toISOString(),
                      finishedAt: new Date().toISOString(),
                    });
                    dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.CalcRun });
                    nav("/dashboard");
                  } catch (error: any) {
                    dispatch({
                      type: "SET_CALC_RUN",
                      calcRunId,
                      status: "error",
                      startedAt: wf.calcRun.startedAt,
                      finishedAt: new Date().toISOString(),
                    });
                    setErrorText(error?.message ?? "Ошибка расчёта");
                  }
                }}
              >
                Запустить расчёт
              </Button>
              <Button variant="secondary" disabled={!dataState.results.metrics} onClick={() => nav("/dashboard")}>
                Открыть результаты
              </Button>
            </div>
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card>
            <div className="cardTitle">Что будет посчитано</div>
            <div className="cardSubtitle">Список строится по выбранным метрикам, без лишних блоков.</div>
            <div className="configureSelectedChips">
              {selectedMetrics.length === 0 ? (
                <span className="textMuted">Ничего не выбрано. Вернитесь к настройкам.</span>
              ) : (
                selectedMetrics.map((metric) => (
                  <Chip key={metric} color="primary" variant="flat" radius="sm">
                    {metric}
                  </Chip>
                ))
              )}
            </div>
            </Card>
          </Reveal>
        </div>

        <aside className="importAside">
          <Card>
            <div className="cardTitle">Параметры запуска</div>
            <div className="runParamList">
              <div><span>Уровень доверия</span><strong>{alpha}</strong></div>
              <div><span>Горизонт</span><strong>{horizonDays} дн.</strong></div>
              <div><span>Tail-модель</span><strong>{parametricTailModel}</strong></div>
              <div><span>Базовая валюта</span><strong>{baseCurrency}</strong></div>
              <div><span>FX-пар</span><strong>{Object.keys(fxRates ?? {}).length}</strong></div>
              <div><span>LC-модель</span><strong>{liquidityModel}</strong></div>
            </div>
          </Card>

          <Card>
            <div className="cardTitle">Что произойдёт после запуска</div>
            <div className="cardSubtitle">Результаты откроются сразу на панели риска.</div>
          </Card>
        </aside>
      </div>
    </Card>
  );
}
