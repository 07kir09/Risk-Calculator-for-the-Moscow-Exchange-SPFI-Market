import { useEffect, useMemo } from "react";
import { Chip, ProgressCircle, Separator } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import AppTable from "../components/AppTable";
import Button from "../components/Button";
import Checklist from "../components/Checklist";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { CorrelationMatrix } from "../components/monolith/visuals";
import {
  AreaTrendChart,
  CompareBarsChart,
  Reveal,
} from "../components/rich/RichVisuals";

type StressRow = {
  scenario_id: string;
  pnl: number;
  limit?: number | null;
  breached: boolean;
};

type ContributorRow = {
  metric?: string;
  position_id: string;
  scenario_id?: string;
  pnl_contribution: number;
  abs_pnl_contribution: number;
};

function formatComputedAt(iso?: string) {
  if (!iso) return "не запускался";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "не запускался";
  return date.toLocaleString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const metrics = dataState.results.metrics;
  const selectedMetrics = wf.calcConfig.selectedMetrics ?? [];
  const selectedMetricSet = useMemo(() => new Set(selectedMetrics), [selectedMetrics]);
  const showVarMetrics =
    selectedMetricSet.has("var_hist") ||
    selectedMetricSet.has("var_param") ||
    selectedMetricSet.has("es_hist") ||
    selectedMetricSet.has("es_param");
  const showLcVar = selectedMetricSet.has("lc_var");
  const showStress = selectedMetricSet.has("stress");
  const showCorrelations = selectedMetricSet.has("correlations");
  const showGreeks = selectedMetricSet.has("greeks");
  const showMargin = selectedMetricSet.has("margin_capital") && wf.calcConfig.marginEnabled;
  const showLimits = showVarMetrics || showLcVar;
  const selectedStressScenarioId = String(wf.calcConfig.params?.selectedStressScenarioId ?? "");

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
  }, [metrics, dispatch]);

  const baseCurrency = String(
    metrics?.base_currency ?? wf.calcConfig.params?.baseCurrency ?? dataState.portfolio.positions[0]?.currency ?? "RUB"
  ).toUpperCase();

  const stressRows = useMemo<StressRow[]>(
    () => (showStress ? metrics?.stress ?? [] : []),
    [metrics?.stress, showStress]
  );
  const selectedStressRow = useMemo(
    () => (selectedStressScenarioId ? stressRows.find((row) => row.scenario_id === selectedStressScenarioId) : undefined),
    [selectedStressScenarioId, stressRows]
  );
  const activeStressScenarioId = selectedStressRow?.scenario_id ?? stressRows[0]?.scenario_id ?? selectedStressScenarioId;

  const topContributors = useMemo<ContributorRow[]>(() => {
    if (!showVarMetrics && !showStress) return [];
    const raw = metrics?.top_contributors;
    if (!raw) return [];
    return Object.values(raw)
      .flat()
      .sort((a, b) => b.abs_pnl_contribution - a.abs_pnl_contribution)
      .slice(0, 6);
  }, [metrics?.top_contributors, showStress, showVarMetrics]);

  const contributorBars = useMemo(() => {
    const maxAbs = Math.max(...topContributors.map((row) => row.abs_pnl_contribution), 1);
    return topContributors.map((row) => ({
      label: row.metric ? `${row.metric} · ${row.position_id}` : row.position_id,
      value: (row.abs_pnl_contribution / maxAbs) * 100,
      tone: row.pnl_contribution < 0 ? ("negative" as const) : ("positive" as const),
    }));
  }, [topContributors]);

  const correlations = showCorrelations ? (metrics?.correlations ?? []) : [];

  const utilization = useMemo(() => {
    if (!showLimits) return 0;
    const rawLimits = metrics?.limits;
    if (rawLimits?.length) {
      return Math.max(...rawLimits.map(([, value, limit]) => (limit ? Math.abs(value / limit) * 100 : 0)), 0);
    }
    if (showLcVar && metrics?.lc_var && metrics?.base_value) {
      return Math.abs(metrics.lc_var / metrics.base_value) * 100;
    }
    return 0;
  }, [metrics?.base_value, metrics?.lc_var, metrics?.limits, showLcVar, showLimits]);

  const worstStress = stressRows.length ? Math.min(...stressRows.map((row) => row.pnl)) : undefined;
  const breachedCount = stressRows.filter((row) => row.breached).length;

  const stressTrendData = useMemo(
    () =>
      (stressRows.length ? stressRows : [{ scenario_id: "base", pnl: 0, limit: 0, breached: false }]).map((row) => ({
        label: row.scenario_id,
        value: row.pnl,
        secondary: row.limit ?? 0,
      })),
    [stressRows]
  );

  const limitBars = useMemo(() => {
    if (!showLimits) return [];
    const source = metrics?.limits?.length
      ? metrics.limits
      : ([["lc_var", metrics?.lc_var ?? 0, metrics?.base_value ?? 1, false]] as const);
    return source.map(([metric, value, limit, breached]) => ({
      label: String(metric),
      value: Math.min(100, limit ? Math.abs((value / limit) * 100) : 0),
      tone: breached ? ("negative" as const) : ("positive" as const),
    }));
  }, [metrics?.base_value, metrics?.lc_var, metrics?.limits, showLimits]);

  const liquidityBars = useMemo(() => {
    if (!showMargin) return [];
    const base = Math.max(Math.abs(metrics?.base_value ?? 0), 1);
    return [
      { label: "Capital", value: Math.min(100, (Math.abs(metrics?.capital ?? 0) / base) * 100), tone: "positive" as const },
      { label: "Initial margin", value: Math.min(100, (Math.abs(metrics?.initial_margin ?? 0) / base) * 100), tone: "neutral" as const },
      { label: "Variation margin", value: Math.min(100, (Math.abs(metrics?.variation_margin ?? 0) / base) * 100), tone: "negative" as const },
    ];
  }, [metrics?.base_value, metrics?.capital, metrics?.initial_margin, metrics?.variation_margin, showMargin]);

  const utilizationColor = utilization >= 100 ? "danger" : utilization >= 75 ? "warning" : "success";
  const statusColor = utilizationColor;
  const statusText =
    utilization >= 100 ? "Есть превышения" : utilization >= 75 ? "Требуется контроль" : "Риск в норме";

  const overviewRows = useMemo(() => {
    const rows: { key: string; cells: [string, string, string] }[] = [];
    if (showVarMetrics) {
      rows.push({
        key: "var",
        cells: ["VaR", formatNumber(metrics?.var_hist ?? metrics?.var_param ?? 0, 2), "Пороговый убыток"],
      });
      rows.push({
        key: "es",
        cells: ["ES", formatNumber(metrics?.es_hist ?? metrics?.es_param ?? 0, 2), "Средний убыток хвоста"],
      });
    }
    if (showLcVar) {
      rows.push({
        key: "lcvar",
        cells: ["LC VaR", formatNumber(metrics?.lc_var ?? 0, 2), "С поправкой на ликвидность"],
      });
    }
    if (showMargin) {
      rows.push({
        key: "capital",
        cells: ["Capital", formatNumber(metrics?.capital ?? 0, 2), "Требуемый капитал"],
      });
      rows.push({
        key: "im",
        cells: ["Initial margin", formatNumber(metrics?.initial_margin ?? 0, 2), "Начальная маржа"],
      });
      rows.push({
        key: "vm",
        cells: ["Variation margin", formatNumber(metrics?.variation_margin ?? 0, 2), "Вариационная маржа"],
      });
    }
    return rows;
  }, [
    metrics?.capital,
    metrics?.es_hist,
    metrics?.es_param,
    metrics?.initial_margin,
    metrics?.lc_var,
    metrics?.var_hist,
    metrics?.var_param,
    metrics?.variation_margin,
    showLcVar,
    showMargin,
    showVarMetrics,
  ]);

  const greeksRows = useMemo(() => {
    if (!showGreeks || !metrics?.greeks) return [];
    return Object.entries(metrics.greeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({
        key: name,
        cells: [name, formatNumber(value, 4)],
      }));
  }, [metrics?.greeks, showGreeks]);

  const stressTableRows = useMemo(
    () =>
      stressRows.map((row) => ({
        key: row.scenario_id,
        cells: [
          row.scenario_id,
          formatNumber(row.pnl, 2),
          row.limit ?? "—",
          <Chip key={`${row.scenario_id}-status`} color={row.breached ? "danger" : "success"} variant="soft" size="sm">
            {row.breached ? "Превышен" : "Ок"}
          </Chip>,
        ],
      })),
    [stressRows]
  );

  const limitTableRows = useMemo(
    () =>
      (metrics?.limits ?? []).map(([metric, value, limit, breached]) => ({
        key: metric,
        cells: [
          metric,
          formatNumber(value, 2),
          formatNumber(limit, 2),
          <Chip key={`${metric}-status`} color={breached ? "danger" : "success"} variant="soft" size="sm">
            {breached ? "Превышен" : "Ок"}
          </Chip>,
        ],
      })),
    [metrics?.limits]
  );

  /* ── Empty state ── */
  if (!metrics) {
    return (
      <div className="importPagePlain">
        <div className="importHeroRow">
          <div>
            <h1 className="pageTitle">Панель риска</h1>
            <div className="importHeroMeta">
              <Chip color="warning" variant="soft" size="sm">Расчёт не выполнен</Chip>
              <span className="importFileTag">Нет итоговых метрик</span>
            </div>
          </div>
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink"
            onClick={() => navigate("/configure")}
            aria-label="К настройке расчёта"
          >
            <span className="importHeroNextLinkText pageTitle">К настройке расчёта</span>
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>→</span>
          </button>
        </div>

        <div className="importZone">
          <div className="importUploadSplit">
            <div className="dashboardEmptyPane">
              <svg className="validateEmptyIcon" viewBox="0 0 24 24" aria-hidden>
                <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 14h-2v-2h2Zm0-4h-2V7h2Z" />
              </svg>
              <div className="validateEmptyTitle">Расчёт ещё не запущен</div>
              <div className="validateEmptySub">Завершите все шаги и запустите расчёт из страницы настройки.</div>
              <div className="dashboardEmptyBtnRow">
                <Button onClick={() => navigate("/configure")}>Перейти к настройке</Button>
              </div>
            </div>

            <div className="dashboardReadinessTile">
              <span className="dashboardReadinessEyebrow">Статус подготовки</span>
              <div className="dashboardReadinessChecklist">
                <Checklist
                  items={[
                    { label: "Портфель загружен", done: dataState.portfolio.positions.length > 0 },
                    { label: "Критических ошибок нет", done: wf.validation.criticalErrors === 0 },
                    { label: "Рыночные данные готовы", done: wf.marketData.status === "ready" && wf.marketData.missingFactors === 0 },
                    { label: "Метрики выбраны", done: wf.calcConfig.selectedMetrics.length > 0 },
                  ]}
                />
              </div>
              <div className="dashboardReadinessFooter">
                Выполните все четыре шага, чтобы запустить расчёт.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Populated state ── */
  return (
    <div className="importPagePlain">

      {/* ── Hero ── */}
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Панель риска</h1>
          <div className="importHeroMeta">
            <Chip color={statusColor} variant="soft" size="sm">{statusText}</Chip>
            <span className="importFileTag">Обновлено: {formatComputedAt(dataState.results.computedAt)}</span>
            <span className="importFileTag">Валюта: {baseCurrency}</span>
            {showStress && activeStressScenarioId ? (
              <span className="importFileTag">Сценарий: {activeStressScenarioId}</span>
            ) : null}
          </div>
        </div>
        <div className="dashboardHeroActions">
          {showStress ? (
            <Button variant="secondary" size="sm" onClick={() => navigate("/stress")}>Стрессы</Button>
          ) : null}
          {showLimits ? (
            <Button variant="secondary" size="sm" onClick={() => navigate("/limits")}>Лимиты</Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => navigate("/export")}>Экспорт</Button>
          <Button size="sm" onClick={() => navigate("/configure")}>Пересчитать</Button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="dashboardKpiRow">
        <div className="dashboardKpiCard">
          <span className="dashboardKpiLabel">Стоимость портфеля</span>
          <strong className="dashboardKpiValue">{formatNumber(metrics.base_value ?? 0, 0)}</strong>
          <span className="dashboardKpiHint">{baseCurrency} · {dataState.portfolio.positions.length} позиций</span>
        </div>
        {showVarMetrics ? (
          <div className={`dashboardKpiCard dashboardKpiCard--${utilization >= 100 ? "danger" : "neutral"}`}>
            <span className="dashboardKpiLabel">VaR / ES</span>
            <strong className="dashboardKpiValue">{formatNumber(metrics.var_hist ?? metrics.var_param ?? 0, 2)}</strong>
            <span className="dashboardKpiHint">ES {formatNumber(metrics.es_hist ?? metrics.es_param ?? 0, 2)}</span>
          </div>
        ) : null}
        {showLcVar ? (
          <div className="dashboardKpiCard">
            <span className="dashboardKpiLabel">LC VaR</span>
            <strong className="dashboardKpiValue">{formatNumber(metrics.lc_var ?? 0, 2)}</strong>
            <span className="dashboardKpiHint">С поправкой на ликвидность</span>
          </div>
        ) : null}
        {showLimits ? (
          <div className={`dashboardKpiCard dashboardKpiCard--${utilizationColor}`}>
            <span className="dashboardKpiLabel">Загрузка лимитов</span>
            <strong className="dashboardKpiValue">{Math.round(utilization)}%</strong>
            <span className="dashboardKpiHint">{breachedCount > 0 ? `${breachedCount} превышений` : "Нет превышений"}</span>
          </div>
        ) : null}
      </div>

      {/* ── Zone: chart + utilization ── */}
      {showStress || showLimits ? (
        <div className={`importZone${utilization < 75 ? " importZone--loaded" : ""}`}>
          <div className="importUploadSplit">

            {/* Left: stress profile */}
            {showStress ? (
              <div className="dashboardChartPane">
                <div className="dashboardChartPaneTop">
                  <span className="dashboardChartEyebrow">Стресс-профиль портфеля</span>
                  <Chip size="sm" color={stressRows.some((r) => r.breached) ? "danger" : "success"} variant="soft">
                    {activeStressScenarioId ? "1 выбран" : `${stressRows.length} сценариев`}
                  </Chip>
                </div>
                <div className="dashboardChartArea">
                  <AreaTrendChart data={stressTrendData} color="#7da7ff" accent="#6eff8e" showSecondary />
                </div>
              </div>
            ) : null}

            {/* Right: utilization tile */}
            {showLimits ? (
              <div className="dashboardUtilTile">
                <span className="dashboardUtilEyebrow">Использование лимитов</span>
                <div className="dashboardUtilCenter">
                  <ProgressCircle
                    aria-label="Загрузка лимитов"
                    value={Math.min(100, utilization)}
                    color={utilizationColor}
                    size="lg"
                    showValueLabel
                  />
                </div>
                <Separator className="importAsideDivider" />
                <div className="dashboardUtilMeta">
                  <div className="dashboardUtilMetaRow">
                    <span>Худший стресс</span>
                    <strong style={{ color: worstStress !== undefined && worstStress < 0 ? "rgba(255,120,120,0.9)" : "rgba(110,255,142,0.9)" }}>
                      {worstStress !== undefined ? formatNumber(worstStress, 2) : "—"}
                    </strong>
                  </div>
                  <div className="dashboardUtilMetaRow">
                    <span>Превышений</span>
                    <strong style={{ color: breachedCount > 0 ? "rgba(255,120,120,0.9)" : "rgba(110,255,142,0.9)" }}>
                      {breachedCount}
                    </strong>
                  </div>
                  <div className="dashboardUtilMetaRow">
                    <span>Позиций</span>
                    <strong>{dataState.portfolio.positions.length}</strong>
                  </div>
                </div>
              </div>
            ) : null}

          </div>
        </div>
      ) : null}

      {/* ── Main Sections ── */}
      <div className="importBody">
        <div className="importBodyMain">
          <Reveal delay={0.06}>
            <div className="dashboardTabGrid">
              <div className="dashboardTabPanel">
                <div className="cardTitle">Обзор расчёта</div>
                <div className="cardSubtitle">Только включённые метрики и их итоговые значения.</div>
                <AppTable
                  ariaLabel="Ключевые показатели риска"
                  headers={["Метрика", "Значение", "Комментарий"]}
                  rows={overviewRows}
                  emptyContent="Нет включённых показателей для отображения."
                />
              </div>
              <div className="dashboardTabPanel">
                <div className="cardTitle">Вклад позиций</div>
                <div className="cardSubtitle">Основные драйверы риска по выбранным расчётам.</div>
                {contributorBars.length ? (
                  <CompareBarsChart data={contributorBars} height={240} />
                ) : (
                  <div className="cardSubtitle">Вклад позиций недоступен для текущего набора метрик.</div>
                )}
              </div>
            </div>
          </Reveal>

          {showStress ? (
            <Reveal delay={0.1}>
              <div className="dashboardTabGrid">
                <div className="dashboardTabPanel">
                  <div className="cardTitle">Выбранный стресс-сценарий</div>
                  <div className="cardSubtitle">
                    Для расчёта используется один сценарий: <strong>{activeStressScenarioId || "не выбран"}</strong>.
                  </div>
                  <AppTable
                    ariaLabel="Детали стресс-сценария"
                    headers={["Сценарий", "P&L", "Лимит", "Статус"]}
                    rows={stressTableRows}
                    emptyContent="Стресс-сценарий не рассчитывался."
                  />
                </div>
                <div className="dashboardTabPanel">
                  <div className="cardTitle">График стресса</div>
                  <div className="cardSubtitle">P&L и лимит для выбранного стресс-сценария.</div>
                  <AreaTrendChart data={stressTrendData} color="#ff7777" accent="#7da7ff" showSecondary />
                </div>
              </div>
            </Reveal>
          ) : null}

          {showLimits ? (
            <Reveal delay={0.12}>
              <div className="dashboardTabGrid">
                <div className="dashboardTabPanel">
                  <div className="cardTitle">Лимиты</div>
                  <div className="cardSubtitle">Использование лимитов по рассчитанным метрикам.</div>
                  <CompareBarsChart data={limitBars} height={220} />
                </div>
                <div className="dashboardTabPanel">
                  <div className="cardTitle">Факт и лимит</div>
                  <div className="cardSubtitle">Точные значения и статус ограничений.</div>
                  <AppTable
                    ariaLabel="Лимиты по метрикам"
                    headers={["Метрика", "Факт", "Лимит", "Статус"]}
                    rows={limitTableRows}
                    emptyContent="Лимиты не рассчитывались."
                  />
                </div>
              </div>
            </Reveal>
          ) : null}

          {(showCorrelations || showGreeks || showMargin) ? (
            <Reveal delay={0.14}>
              <div className="dashboardTabGrid">
                {showCorrelations ? (
                  <div className="dashboardTabPanel">
                    <div className="cardTitle">Корреляции факторов</div>
                    <div className="cardSubtitle">Матрица корреляций активна только когда метрика включена.</div>
                    <CorrelationMatrix matrix={correlations} />
                  </div>
                ) : null}
                {showGreeks ? (
                  <div className="dashboardTabPanel">
                    <div className="cardTitle">Чувствительности (Greeks)</div>
                    <div className="cardSubtitle">Агрегированные чувствительности портфеля.</div>
                    <AppTable
                      ariaLabel="Чувствительности портфеля"
                      headers={["Параметр", "Значение"]}
                      rows={greeksRows}
                      emptyContent="Чувствительности не рассчитаны."
                    />
                  </div>
                ) : null}
                {showMargin ? (
                  <div className="dashboardTabPanel">
                    <div className="cardTitle">Маржа и капитал</div>
                    <div className="cardSubtitle">Показатели маржи для текущего расчёта.</div>
                    <CompareBarsChart data={liquidityBars} height={180} />
                    <div className="dashboardFactorStats">
                      {showLcVar ? (
                        <div className="dashboardFactorStat">
                          <span>LC VaR</span>
                          <strong>{formatNumber(metrics.lc_var ?? 0, 2)}</strong>
                        </div>
                      ) : null}
                      <div className="dashboardFactorStat">
                        <span>Capital</span>
                        <strong>{formatNumber(metrics.capital ?? 0, 2)}</strong>
                      </div>
                      <div className="dashboardFactorStat">
                        <span>Initial margin</span>
                        <strong>{formatNumber(metrics.initial_margin ?? 0, 2)}</strong>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </Reveal>
          ) : null}
        </div>
      </div>

    </div>
  );
}
