import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { Chip, Table, Button as HeroButton, ButtonGroup } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import AppTabs from "../components/AppTabs";
import AppTable from "../components/AppTable";
import Button from "../components/Button";
import Checklist from "../components/Checklist";
import InteractiveRiskChart from "../components/InteractiveRiskChart";
import Card from "../ui/Card";
import { metricsNeedCorrelationRefetch, useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { PositionDTO } from "../api/types";
import { CorrelationMatrix } from "../components/monolith/visuals";
import { runRiskCalculation } from "../api/services/risk";
import { fetchScenarioCatalog } from "../api/endpoints";
import { applyAutoLimits, isDemoDefaultLimitRows, isDemoDefaultLimits } from "../lib/autoLimits";
import {
  isPreliminaryLimitSource,
  limitSourceDescription,
  limitSourceLabel,
  limitSourceStatus,
} from "../lib/limitSource";
import { attachMethodologyMetadata } from "../lib/methodology";
import {
  MetricCompositionChart,
  RiskConnectionMap,
} from "../components/rich/DashboardInsightCharts";
import {
  AreaTrendChart,
  GlassPanel,
  Reveal,
} from "../components/rich/RichVisuals";
import { ChartInsights } from "../components/rich/ChartInsights";
import {
  type ChartInsightItem,
  buildCompositionInsights,
  buildMetricCompositionInsights,
  buildRiskConnectionInsights,
} from "../lib/chartInsights";

type StressRow = {
  scenario_id: string;
  pnl: number;
  limit?: number | null;
  breached: boolean;
};

type CorrelationRefreshState = {
  status: "idle" | "loading" | "blocked" | "failed";
  label: string | null;
  detail: string | null;
};

type ContributorSummary = {
  key: string;
  metric: string;
  positionId: string;
  label: string;
  abs: number;
  net: number;
  share: number;
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

function formatOptionalNumber(value: number | null | undefined, digits = 0) {
  return value == null || !Number.isFinite(value) ? "—" : formatNumber(value, digits);
}

const METRIC_LABELS: Record<string, string> = {
  stress: "Stress",
  var_hist: "Scenario VaR",
  es_hist: "Scenario ES",
  var_param: "Param VaR",
  es_param: "Param ES",
  lc_var: "LC VaR",
};

const COMPOSITION_PALETTE = ["#7da7ff", "#6eff8e", "#ffb86a", "#82e6ff", "#ff9b85", "#cdb8ff"];
const CONTRIBUTOR_PALETTE = ["#7da7ff", "#6eff8e", "#ffb86a", "#ff8f8f"];
const DASHBOARD_CHART_HEIGHT = 220;
const DASHBOARD_INSIGHT_HEIGHT = 260;
const DASHBOARD_NETWORK_HEIGHT = 280;
const DASHBOARD_STRESS_TAB_HEIGHT = 400;
const VALIDATION_LOG_TRUNCATE_THRESHOLD = 100;
const VALIDATION_LOG_COLLAPSED_LIMIT = 25;

function formatMetricLabel(metric?: string) {
  if (!metric) return "Метрика";
  return METRIC_LABELS[metric] ?? metric.replaceAll("_", " ");
}

function estimatePositionExposure(position: PositionDTO) {
  const quantity = Math.abs(position.quantity ?? 1);
  const notionalValue = Math.abs(position.notional ?? 0) * quantity;
  const marketValue = Math.abs(position.underlying_price ?? 0) * quantity;
  return Math.max(notionalValue, marketValue, 1);
}

function formatPositionLabel(position: PositionDTO | undefined, fallbackId: string) {
  const symbol = position?.underlying_symbol?.trim();
  if (symbol && symbol !== fallbackId) return `${fallbackId} · ${symbol}`;
  return fallbackId;
}

function hasBalancedUnderlyingShocks(scenarios: Array<{ underlying_shift?: number | null }>) {
  let hasDownside = false;
  let hasUpside = false;

  for (const scenario of scenarios) {
    const shift = Number(scenario.underlying_shift ?? 0);
    if (shift < 0) hasDownside = true;
    if (shift > 0) hasUpside = true;
  }

  return hasDownside && hasUpside;
}

function nearlyEqual(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return false;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / scale < 1e-9;
}

function isUnitTestRuntime() {
  const maybeProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  return maybeProcess?.env?.NODE_ENV === "test";
}

function InlineChartCaption({
  item,
  className,
}: {
  item: ChartInsightItem | null;
  className?: string;
}) {
  if (!item?.text.trim()) return null;

  return (
    <div className={`chartFootnote chartFootnote--${item.tone ?? "default"} ${className ?? ""}`.trim()}>
      <span className="chartFootnoteLabel">{item.label}</span>
      <p className="chartFootnoteText">{item.text}</p>
    </div>
  );
}

function buildWorkspaceStressCaption(params: {
  stressRows: StressRow[];
  scenarioCount: number;
  baseCurrency: string;
}): ChartInsightItem {
  const { stressRows, scenarioCount, baseCurrency } = params;
  if (!stressRows.length) {
    return {
      label: "Статус",
      text: scenarioCount
        ? `Stress P&L ещё не рассчитан: в каталоге подготовлено ${scenarioCount} сценариев, график заполнится после следующего запуска.`
        : "Добавьте сценарии и запустите расчёт, чтобы здесь появился рабочий профиль stress P&L.",
      tone: "warning",
    };
  }

  const worst = stressRows.reduce((acc, row) => (row.pnl < acc.pnl ? row : acc), stressRows[0]);
  const best = stressRows.reduce((acc, row) => (row.pnl > acc.pnl ? row : acc), stressRows[0]);
  const breachedCount = stressRows.filter((row) => row.breached).length;

  if (worst.pnl >= 0) {
    return {
      label: "Профиль",
      text: `Даже худший сценарий ${worst.scenario_id} остаётся неотрицательным; коридор между экстремумами = ${formatNumber(best.pnl - worst.pnl, 2)} ${baseCurrency}.`,
      tone: "success",
    };
  }

  return {
    label: "Хвост",
    text: `Худший сценарий ${worst.scenario_id} = ${formatNumber(worst.pnl, 2)} ${baseCurrency}, лучший ${best.scenario_id} = ${formatNumber(best.pnl, 2)} ${baseCurrency}; breach в ${breachedCount} из ${stressRows.length}.`,
    tone: breachedCount ? "danger" : "warning",
  };
}

function buildContributorCaption(params: {
  contributors: ContributorSummary[];
  baseCurrency: string;
  viewMode: "absolute" | "share";
}): ChartInsightItem {
  const { contributors, baseCurrency, viewMode } = params;
  if (!contributors.length) {
    return {
      label: "Вкладчики",
      text: "Позиционные вклады ещё не попали в ответ расчёта, поэтому treemap пока остаётся без акцентов.",
      tone: "warning",
    };
  }

  const leader = contributors[0];
  const topThreeShare = contributors.slice(0, 3).reduce((sum, row) => sum + row.share, 0);
  const valueText = viewMode === "share"
    ? `${formatNumber(leader.share, 1)}% видимого риска`
    : `${formatNumber(leader.abs, 2)} ${baseCurrency}`;

  return {
    label: viewMode === "share" ? "Доля" : "Лидер",
    text: `${leader.label} держит ${valueText}; топ-3 узла концентрируют ${formatNumber(topThreeShare, 1)}% видимого вклада.`,
    tone: topThreeShare >= 75 ? "warning" : leader.net < 0 ? "danger" : "default",
  };
}

function buildStressTableCaption(params: {
  stressRows: StressRow[];
  scenarioCount: number;
  baseCurrency: string;
}): ChartInsightItem {
  const { stressRows, scenarioCount, baseCurrency } = params;
  if (!stressRows.length) {
    return {
      label: "Срез",
      text: scenarioCount
        ? `Во вкладке подготовлено ${scenarioCount} сценариев, но bar-chart появится только после stress-расчёта.`
        : "Сначала добавьте сценарии, затем bar-chart и таблица заполнятся автоматически.",
      tone: "warning",
    };
  }

  const worst = stressRows.reduce((acc, row) => (row.pnl < acc.pnl ? row : acc), stressRows[0]);
  const best = stressRows.reduce((acc, row) => (row.pnl > acc.pnl ? row : acc), stressRows[0]);
  const negativeCount = stressRows.filter((row) => row.pnl < 0).length;
  const limitCount = stressRows.filter((row) => row.limit !== null && row.limit !== undefined).length;
  const breachedCount = stressRows.filter((row) => row.breached).length;

  return {
    label: "Сценарии",
    text:
      negativeCount === 0
        ? `Все ${stressRows.length} сценариев выше нуля; диапазон bar-chart идёт от ${formatNumber(worst.pnl, 2)} до ${formatNumber(best.pnl, 2)} ${baseCurrency}.`
        : `${negativeCount} из ${stressRows.length} сценариев лежат ниже нуля; лимит есть у ${limitCount}, breach у ${breachedCount}, худший хвост = ${formatNumber(worst.pnl, 2)} ${baseCurrency}.`,
    tone: breachedCount ? "danger" : negativeCount ? "warning" : "success",
  };
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const storedMetrics = dataState.results.metrics;
  const metrics = useMemo(() => {
    if (!storedMetrics) return null;
    if (!dataState.limits || isDemoDefaultLimits(dataState.limits) || isDemoDefaultLimitRows(storedMetrics.limits)) {
      return attachMethodologyMetadata(applyAutoLimits(storedMetrics), "draft_auto");
    }
    return attachMethodologyMetadata(storedMetrics, dataState.limitSource ?? "manual_user");
  }, [dataState.limitSource, dataState.limits, storedMetrics]);
  const [contributorViewMode, setContributorViewMode] = useState<"absolute" | "share">("absolute");
  const [validationLogExpanded, setValidationLogExpanded] = useState(false);
  const [validationLogShowAll, setValidationLogShowAll] = useState(false);
  const [correlationRefresh, setCorrelationRefresh] = useState<CorrelationRefreshState>({
    status: "idle",
    label: null,
    detail: null,
  });
  const correlationRefreshAttemptRef = useRef<string | null>(null);
  const staleMetricsRefreshAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
  }, [metrics, dispatch]);

  useEffect(() => {
    setValidationLogExpanded(false);
    setValidationLogShowAll(false);
  }, [metrics?.validation_log]);

  const baseCurrency = String(
    metrics?.base_currency ?? wf.calcConfig.params?.baseCurrency ?? dataState.portfolio.positions[0]?.currency ?? "RUB"
  ).toUpperCase();

  const stressRows = useMemo<StressRow[]>(() => metrics?.stress ?? [], [metrics?.stress]);
  const validationLogEntries = useMemo(() => metrics?.validation_log ?? [], [metrics?.validation_log]);
  const isLargeValidationLog = validationLogEntries.length >= VALIDATION_LOG_TRUNCATE_THRESHOLD;
  const visibleValidationLogEntries = validationLogShowAll || !isLargeValidationLog
    ? validationLogEntries
    : validationLogEntries.slice(0, VALIDATION_LOG_COLLAPSED_LIMIT);

  useEffect(() => {
    if (isUnitTestRuntime()) return;

    if (!metrics || dataState.portfolio.positions.length === 0) {
      staleMetricsRefreshAttemptRef.current = null;
      return;
    }

    const varMetric = metrics.var_hist ?? metrics.var_param;
    const esMetric = metrics.es_hist ?? metrics.es_param;
    const stressPnls = stressRows.map((row) => Number(row.pnl)).filter(Number.isFinite);
    const looksLikeStaleOneScenarioRun =
      varMetric === 0 &&
      esMetric === 0 &&
      nearlyEqual(metrics.lc_var, metrics.lc_var_addon) &&
      stressPnls.length > 0 &&
      stressPnls.every((pnl) => pnl >= 0);
    const scenarioSetLooksIncomplete = dataState.scenarios.length < 2 || !hasBalancedUnderlyingShocks(dataState.scenarios);

    if (!looksLikeStaleOneScenarioRun && !scenarioSetLooksIncomplete) return;

    const attemptKey = [
      dataState.portfolio.importedAt ?? "portfolio",
      dataState.portfolio.positions.length,
      dataState.scenarios.map((scenario) => scenario.scenario_id).join(","),
      String(metrics.lc_var ?? ""),
      String(metrics.lc_var_addon ?? ""),
    ].join("|");
    if (staleMetricsRefreshAttemptRef.current === attemptKey) return;
    staleMetricsRefreshAttemptRef.current = attemptKey;

    let cancelled = false;
    let completed = false;
    setCorrelationRefresh({
      status: "loading",
      label: "Обновляем результаты",
      detail: "Найден сохранённый расчёт с неполным набором сценариев. Пересчитываем dashboard с полным каталогом.",
    });

    void (async () => {
      const scenarios = await fetchScenarioCatalog();
      if (cancelled) return;
      const scenariosForRun = scenarios.length ? scenarios : dataState.scenarios;
      const limitsForRun = dataState.limits && !isDemoDefaultLimits(dataState.limits)
        ? dataState.limits
        : undefined;
      const selectedMetrics = Array.from(new Set([...(wf.calcConfig.selectedMetrics ?? []), "var_hist", "es_hist", "lc_var", "stress"]));
      const marketDataSessionId = dataState.marketDataSummary?.session_id;

      const fresh = await runRiskCalculation({
        positions: dataState.portfolio.positions,
        scenarios: scenariosForRun,
        limits: limitsForRun,
        alpha: Number(wf.calcConfig.params?.alpha ?? 0.99),
        horizonDays: Number(wf.calcConfig.params?.horizonDays ?? 10),
        parametricTailModel: String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher"),
        baseCurrency,
        fxRates: wf.calcConfig.params?.fxRates,
        liquidityModel: String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value"),
        selectedMetrics,
        marginEnabled: true,
        marketDataSessionId,
        forceAutoMarketData: dataState.marketDataMode === "api_auto" && !marketDataSessionId,
      });

      if (cancelled) return;
      dataDispatch({ type: "SET_SCENARIOS", scenarios: scenariosForRun });
      dataDispatch({ type: "SET_LIMITS", limits: limitsForRun ?? null, limitSource: limitsForRun ? dataState.limitSource : "draft_auto" });
      dataDispatch({
        type: "SET_RESULTS",
        metrics: attachMethodologyMetadata(limitsForRun ? fresh : applyAutoLimits(fresh), limitsForRun ? dataState.limitSource : "draft_auto"),
      });
      completed = true;
      setCorrelationRefresh({ status: "idle", label: null, detail: null });
    })().catch((error: unknown) => {
      if (cancelled) return;
      completed = true;
      setCorrelationRefresh({
        status: "failed",
        label: "Не удалось обновить результаты",
        detail: error instanceof Error ? error.message : "Перезапустите расчёт из настройки.",
      });
    });

    return () => {
      cancelled = true;
      if (!completed && staleMetricsRefreshAttemptRef.current === attemptKey) {
        staleMetricsRefreshAttemptRef.current = null;
      }
    };
  }, [
    baseCurrency,
    dataDispatch,
    dataState.limits,
    dataState.marketDataMode,
    dataState.marketDataSummary?.session_id,
    dataState.portfolio.importedAt,
    dataState.portfolio.positions,
    dataState.scenarios,
    metrics,
    stressRows,
    wf.calcConfig.params?.alpha,
    wf.calcConfig.params?.baseCurrency,
    wf.calcConfig.params?.fxRates,
    wf.calcConfig.params?.horizonDays,
    wf.calcConfig.params?.liquidityModel,
    wf.calcConfig.params?.parametricTailModel,
    wf.calcConfig.selectedMetrics,
  ]);

  useEffect(() => {
    if (!metrics) {
      correlationRefreshAttemptRef.current = null;
      setCorrelationRefresh((current) =>
        current.status === "idle" && current.label === null && current.detail === null
          ? current
          : { status: "idle", label: null, detail: null }
      );
      return;
    }

    if (!metricsNeedCorrelationRefetch(metrics)) {
      correlationRefreshAttemptRef.current = null;
      setCorrelationRefresh((current) =>
        current.status === "idle" && current.label === null && current.detail === null
          ? current
          : { status: "idle", label: null, detail: null }
      );
      return;
    }

    const selectedMetrics = wf.calcConfig.selectedMetrics ?? [];
    const hasMarketDataSource = Boolean(dataState.marketDataSummary?.session_id);
    const canRefetch =
      selectedMetrics.includes("correlations") &&
      dataState.portfolio.positions.length > 0 &&
      dataState.scenarios.length > 0 &&
      hasMarketDataSource;

    if (!canRefetch) {
      const label = "Корреляции недоступны";
      const detail = !selectedMetrics.includes("correlations")
        ? "Этот расчёт не запрашивал correlations. Запустите расчёт заново из настройки, если нужен этот разрез."
        : dataState.portfolio.positions.length === 0 || dataState.scenarios.length === 0
          ? "Невозможно пересчитать корреляции без портфеля и сценариев. Запустите расчёт заново из настройки."
          : !hasMarketDataSource
            ? "Невозможно пересчитать correlations/pnl_matrix без доступной сессии market data. Запустите расчёт заново из настройки."
            : "После refresh не сохранились correlations/pnl_matrix. Запустите расчёт заново из настройки.";
      correlationRefreshAttemptRef.current = null;
      setCorrelationRefresh((current) =>
        current.status === "blocked" && current.label === label && current.detail === detail
          ? current
          : { status: "blocked", label, detail }
      );
      return;
    }

    const attemptKey = [
      dataState.portfolio.importedAt ?? "portfolio",
      dataState.portfolio.positions.length,
      dataState.scenarios.length,
      selectedMetrics.join(","),
      String(wf.calcConfig.params?.alpha ?? ""),
      String(wf.calcConfig.params?.horizonDays ?? ""),
      String(wf.calcConfig.params?.parametricTailModel ?? ""),
      String(wf.calcConfig.params?.baseCurrency ?? ""),
      String(wf.calcConfig.params?.liquidityModel ?? ""),
      String(dataState.marketDataMode ?? "api_auto"),
      String(dataState.marketDataSummary?.session_id ?? ""),
    ].join("|");

    if (correlationRefreshAttemptRef.current === attemptKey) return;
    correlationRefreshAttemptRef.current = attemptKey;
    setCorrelationRefresh({ status: "loading", label: "Восстанавливаем корреляции", detail: "Пересчитываем матрицу P&L после refresh." });

    let cancelled = false;
    const marketDataSessionId = dataState.marketDataSummary?.session_id;
    void runRiskCalculation({
      positions: dataState.portfolio.positions,
      scenarios: dataState.scenarios,
      limits: dataState.limits ?? undefined,
      alpha: Number(wf.calcConfig.params?.alpha ?? 0.99),
      horizonDays: Number(wf.calcConfig.params?.horizonDays ?? 10),
      parametricTailModel: String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher"),
      baseCurrency,
      fxRates: wf.calcConfig.params?.fxRates,
      liquidityModel: String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value"),
      selectedMetrics,
      marginEnabled: wf.calcConfig.marginEnabled,
      marketDataSessionId,
      forceAutoMarketData: dataState.marketDataMode === "api_auto" && !marketDataSessionId,
    })
      .then((fresh) => {
        if (cancelled) return;
        dataDispatch({
          type: "SET_RESULTS",
          metrics: attachMethodologyMetadata(dataState.limits ? fresh : applyAutoLimits(fresh), dataState.limits ? dataState.limitSource : "draft_auto"),
        });
        if (metricsNeedCorrelationRefetch(fresh)) {
          setCorrelationRefresh({
            status: "failed",
            label: "Не удалось восстановить корреляции",
            detail: "Повторный расчёт не вернул correlations/pnl_matrix. Запустите расчёт заново из настройки.",
          });
          return;
        }
        setCorrelationRefresh({ status: "idle", label: null, detail: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const detail =
          error instanceof Error
            ? `Не удалось восстановить корреляции: ${error.message}`
            : "Не удалось восстановить корреляции. Запустите расчёт заново из настройки.";
        setCorrelationRefresh({ status: "failed", label: "Не удалось восстановить корреляции", detail });
      });

    return () => {
      cancelled = true;
    };
  }, [
    baseCurrency,
    dataDispatch,
    dataState.limits,
    dataState.marketDataMode,
    dataState.marketDataSummary?.session_id,
    dataState.portfolio.importedAt,
    dataState.portfolio.positions,
    dataState.scenarios,
    metrics,
    wf.calcConfig.marginEnabled,
    wf.calcConfig.params?.alpha,
    wf.calcConfig.params?.baseCurrency,
    wf.calcConfig.params?.horizonDays,
    wf.calcConfig.params?.liquidityModel,
    wf.calcConfig.params?.parametricTailModel,
    wf.calcConfig.params?.fxRates,
    wf.calcConfig.selectedMetrics,
  ]);
  const contributorItems = useMemo<ContributorSummary[]>(() => {
    const source = metrics?.top_contributors ?? {};
    const aggregate = new Map<string, {
      key: string;
      metric: string;
      positionId: string;
      label: string;
      abs: number;
      net: number;
    }>();

    for (const [metricKey, rows] of Object.entries(source)) {
      for (const row of rows ?? []) {
        const key = `${metricKey}::${row.position_id}`;
        const current = aggregate.get(key) ?? {
          key,
          metric: metricKey,
          positionId: row.position_id,
          label: `${formatMetricLabel(metricKey)} · ${row.position_id}`,
          abs: 0,
          net: 0,
        };
        current.abs += Math.abs(Number(row.abs_pnl_contribution ?? 0));
        current.net += Number(row.pnl_contribution ?? 0);
        aggregate.set(key, current);
      }
    }

    const ranked = Array.from(aggregate.values())
      .sort((a, b) => b.abs - a.abs)
      .slice(0, 16);
    const totalAbs = ranked.reduce((sum, row) => sum + row.abs, 0) || 1;

    return ranked.map((row) => ({
      ...row,
      share: (row.abs / totalAbs) * 100,
    }));
  }, [metrics?.top_contributors]);

  const correlationView = useMemo(() => {
    const positionLabels = dataState.portfolio.positions.map((position) => position.position_id);

    const sanitizeSquare = (raw: unknown): number[][] => {
      if (!Array.isArray(raw)) return [];
      const rows = raw.filter((row): row is unknown[] => Array.isArray(row));
      if (!rows.length) return [];
      const minCols = Math.min(...rows.map((row) => row.length));
      const size = Math.min(rows.length, minCols);
      if (size < 2) return [];
      return Array.from({ length: size }, (_, rowIndex) =>
        Array.from({ length: size }, (_, colIndex) => {
          if (rowIndex === colIndex) return 1;
          const direct = Number(rows[rowIndex]?.[colIndex]);
          const reverse = Number(rows[colIndex]?.[rowIndex]);
          const hasDirect = Number.isFinite(direct);
          const hasReverse = Number.isFinite(reverse);
          const mixed = hasDirect && hasReverse ? (direct + reverse) / 2 : hasDirect ? direct : hasReverse ? reverse : 0;
          return Math.max(-1, Math.min(1, mixed));
        })
      );
    };

    const matrix = sanitizeSquare(metrics?.correlations ?? []);
    return {
      matrix,
      labels: positionLabels.slice(0, matrix.length),
    };
  }, [dataState.portfolio.positions, metrics?.correlations]);

  const utilization = useMemo(() => {
    const rawLimits = metrics?.limits;
    if (rawLimits?.length) {
      return Math.max(...rawLimits.map(([, value, limit]) => (limit ? Math.abs(value / limit) * 100 : 0)), 0);
    }
    return 0;
  }, [metrics?.limits]);

  const derivedWorstStress = stressRows.length ? Math.min(...stressRows.map((row) => row.pnl)) : undefined;
  const worstStress = metrics.worst_stress ?? derivedWorstStress;
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
  const stressScenarioData = useMemo(
    () =>
      stressRows.map((row, index) => {
        const pnl = Number(row.pnl ?? 0);
        const rawLimit = Number(row.limit);
        const limit = Number.isFinite(rawLimit) ? rawLimit : null;
        const profit = pnl > 0 ? Number(pnl.toFixed(2)) : 0;
        const expenses = pnl < 0 ? Number(pnl.toFixed(2)) : 0;
        const income = limit !== null && limit > 0 ? Number(limit.toFixed(2)) : 0;
        return {
          key: `${row.scenario_id}-${index}`,
          label: row.scenario_id || `S${index + 1}`,
          pnl,
          limit,
          profit,
          expenses,
          income,
          breached: Boolean(row.breached),
        };
      }),
    [stressRows]
  );
  const hasStressLoss = worstStress != null && worstStress < 0;
  const varMetricValue = metrics.var_hist ?? metrics.var_param ?? null;
  const esMetricValue = metrics.es_hist ?? metrics.es_param ?? null;
  const varValue = varMetricValue ?? 0;
  const esValue = esMetricValue ?? 0;

  const limitOverviewRows = useMemo(
    () =>
      (metrics?.limits ?? [])
        .map(([metric, value, limit, breached]) => {
          const utilizationPct = limit ? Math.abs(value / limit) * 100 : 0;
          return {
            metric: String(metric),
            value: Number(value),
            limit: Number(limit),
            breached: Boolean(breached),
            utilizationPct,
          };
        })
        .sort((a, b) => b.utilizationPct - a.utilizationPct),
    [metrics?.limits]
  );
  const breachedLimitsCount = limitOverviewRows.filter((row) => row.breached).length;
  const closestLimitRow = limitOverviewRows[0];
  const lcVarValue = metrics.lc_var ?? null;
  const capitalValue = metrics.capital ?? null;
  const initialMarginValue = metrics.initial_margin ?? null;
  const baseValueAbs = Math.max(Math.abs(metrics.base_value ?? 0), 1);
  const varSharePct = (Math.abs(varValue) / baseValueAbs) * 100;
  const esSharePct = (Math.abs(esValue) / baseValueAbs) * 100;
  const lcVarSharePct = lcVarValue !== null ? (Math.abs(lcVarValue) / baseValueAbs) * 100 : null;
  const capitalCoveragePct = varMetricValue !== null && Math.abs(varMetricValue) > 0 && capitalValue !== null ? (capitalValue / Math.abs(varMetricValue)) * 100 : null;
  const marginLoadPct = initialMarginValue !== null ? (Math.abs(initialMarginValue) / baseValueAbs) * 100 : null;

  const correlationMatrixSize = Math.min(Math.max(correlationView.labels.length, 2), 5);
  const capitalInflow = metrics?.capital && metrics?.base_value ? (metrics.capital / metrics.base_value) * 100 : 0;
  const variationOutflow = metrics?.variation_margin && metrics?.base_value ? (-metrics.variation_margin / metrics.base_value) * 100 : 0;
  const utilizationStatusLabel = utilization >= 100 ? "выше текущего порога" : utilization >= 75 ? "зона контроля" : "ниже текущего порога";
  const confidenceLabel = metrics?.confidence_level ? `${Math.round(metrics.confidence_level * 100)}% confidence` : null;
  const horizonLabel = metrics?.horizon_days ? `${metrics.horizon_days} дн. горизонт` : null;
  const modeLabel = metrics?.mode ? `режим ${metrics.mode}` : null;
  const effectiveLimitSource = metrics.limit_source ?? dataState.limitSource ?? "draft_auto";
  const preliminaryLimits = isPreliminaryLimitSource(effectiveLimitSource);
  const validationMessages = validationLogEntries.map((entry) => entry.message);
  const inferredMissingCurveWarnings = validationMessages.filter((message) => /не найдена discount curve/i.test(message));
  const dataQuality = metrics.data_quality;
  const missingCurves = dataQuality?.missing_curves?.length ? dataQuality.missing_curves : inferredMissingCurveWarnings;
  const affectedPositions = dataQuality?.affected_positions ?? [];
  const isMarketDataIncomplete =
    metrics.market_data_completeness === "incomplete" ||
    dataQuality?.market_data_completeness === "incomplete" ||
    missingCurves.length > 0;

  const positionsById = useMemo(
    () => new Map(dataState.portfolio.positions.map((position) => [position.position_id, position])),
    [dataState.portfolio.positions]
  );

  const portfolioComposition = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const position of dataState.portfolio.positions) {
      const bucket = position.underlying_symbol || position.currency || position.position_id;
      grouped.set(bucket, (grouped.get(bucket) ?? 0) + estimatePositionExposure(position));
    }

    const ordered = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
    const slices = ordered.slice(0, 5).map(([label, value], index) => ({
      label,
      value,
      color: COMPOSITION_PALETTE[index % COMPOSITION_PALETTE.length],
    }));

    const other = ordered.slice(5).reduce((sum, [, value]) => sum + value, 0);
    if (other > 0) {
      slices.push({
        label: "Остальные",
        value: other,
        color: "rgba(244,241,234,0.28)",
      });
    }

    return slices;
  }, [dataState.portfolio.positions]);

  const contributorMetricKeys = useMemo(() => {
    const source = metrics?.top_contributors ?? {};
    const preferred = ["stress", "var_hist", "es_hist", "var_param", "es_param", "lc_var"];
    const existing = preferred.filter((metricKey) => source[metricKey]?.length);
    const rest = Object.keys(source).filter((metricKey) => !preferred.includes(metricKey) && source[metricKey]?.length);
    return [...existing, ...rest].slice(0, 4);
  }, [metrics?.top_contributors]);

  const focusPositionIds = useMemo(() => {
    const source = metrics?.top_contributors ?? {};
    const totals = new Map<string, number>();

    for (const metricKey of contributorMetricKeys) {
      for (const row of source[metricKey] ?? []) {
        totals.set(row.position_id, (totals.get(row.position_id) ?? 0) + row.abs_pnl_contribution);
      }
    }

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([positionId]) => positionId);
  }, [contributorMetricKeys, metrics?.top_contributors]);

  const contributorMetricComposition = useMemo(() => {
    const source = metrics?.top_contributors ?? {};
    if (!contributorMetricKeys.length || !focusPositionIds.length) {
      return { rows: [], series: [] };
    }

    const rows = contributorMetricKeys.map((metricKey) => {
      const metricRows = source[metricKey] ?? [];
      const total = metricRows.reduce((sum, row) => sum + row.abs_pnl_contribution, 0) || 1;
      const chartRow: Record<string, string | number> = { label: formatMetricLabel(metricKey) };
      let covered = 0;

      for (const positionId of focusPositionIds) {
        const contribution = metricRows
          .filter((row) => row.position_id === positionId)
          .reduce((sum, row) => sum + row.abs_pnl_contribution, 0);
        const share = (contribution / total) * 100;
        chartRow[positionId] = Number(share.toFixed(2));
        covered += share;
      }

      const other = Math.max(0, 100 - covered);
      if (other > 0.05) {
        chartRow.other = Number(other.toFixed(2));
      }

      return chartRow;
    });

    const series = focusPositionIds.map((positionId, index) => ({
      key: positionId,
      label: formatPositionLabel(positionsById.get(positionId), positionId),
      color: CONTRIBUTOR_PALETTE[index % CONTRIBUTOR_PALETTE.length],
    }));

    if (rows.some((row) => Number(row.other ?? 0) > 0.05)) {
      series.push({
        key: "other",
        label: "Остальные",
        color: "rgba(244,241,234,0.28)",
      });
    }

    return { rows, series };
  }, [contributorMetricKeys, focusPositionIds, metrics?.top_contributors, positionsById]);

  const riskConnectionData = useMemo(() => {
    const source = metrics?.top_contributors ?? {};
    if (!contributorMetricKeys.length || !focusPositionIds.length) {
      return { metrics: [], positions: [], links: [] };
    }

    const focusSet = new Set(focusPositionIds);
    const metricNodes = contributorMetricKeys
      .map((metricKey) => ({
        id: metricKey,
        label: formatMetricLabel(metricKey),
        weight: (source[metricKey] ?? []).reduce((sum, row) => sum + row.abs_pnl_contribution, 0),
        tone: "metric" as const,
      }))
      .filter((metricNode) => metricNode.weight > 0);

    const positionStats = new Map<string, { abs: number; net: number }>();
    const links: { from: string; to: string; weight: number }[] = [];

    for (const metricKey of contributorMetricKeys) {
      const aggregate = new Map<string, { abs: number; net: number }>();

      for (const row of source[metricKey] ?? []) {
        if (!focusSet.has(row.position_id)) continue;
        const current = aggregate.get(row.position_id) ?? { abs: 0, net: 0 };
        aggregate.set(row.position_id, {
          abs: current.abs + row.abs_pnl_contribution,
          net: current.net + row.pnl_contribution,
        });
      }

      for (const [positionId, value] of aggregate.entries()) {
        links.push({ from: metricKey, to: positionId, weight: value.abs });
        const current = positionStats.get(positionId) ?? { abs: 0, net: 0 };
        positionStats.set(positionId, {
          abs: current.abs + value.abs,
          net: current.net + value.net,
        });
      }
    }

    const positionNodes = focusPositionIds.flatMap((positionId) => {
      const stats = positionStats.get(positionId);
      if (!stats) return [];
      return [{
        id: positionId,
        label: formatPositionLabel(positionsById.get(positionId), positionId),
        weight: stats.abs,
        tone: stats.net < 0 ? "negative" as const : "positive" as const,
      }];
    });

    return { metrics: metricNodes, positions: positionNodes, links };
  }, [contributorMetricKeys, focusPositionIds, metrics?.top_contributors, positionsById]);

  const compositionInsights = useMemo(
    () => buildCompositionInsights({ slices: portfolioComposition }),
    [portfolioComposition]
  );
  const workspaceStressCaption = useMemo(
    () => buildWorkspaceStressCaption({ stressRows, scenarioCount: stressRows.length || dataState.scenarios.length, baseCurrency }),
    [baseCurrency, dataState.scenarios.length, stressRows]
  );
  const contributorCaption = useMemo(
    () => buildContributorCaption({ contributors: contributorItems, baseCurrency, viewMode: contributorViewMode }),
    [baseCurrency, contributorItems, contributorViewMode]
  );
  const stressTabCaption = useMemo(
    () => buildStressTableCaption({ stressRows, scenarioCount: stressRows.length || dataState.scenarios.length, baseCurrency }),
    [baseCurrency, dataState.scenarios.length, stressRows]
  );
  const stressScenarioOption = useMemo<EChartsOption | null>(() => {
    if (!stressScenarioData.length) return null;

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
      },
      legend: {
        data: ["Profit", "Expenses"],
        top: 0,
        textStyle: {
          color: "rgba(244,241,234,0.7)",
        },
      },
      grid: {
        left: 10,
        right: 16,
        top: 36,
        bottom: 12,
        containLabel: true,
      },
      xAxis: [
        {
          type: "value",
          axisLabel: {
            color: "rgba(244,241,234,0.58)",
            formatter: (value: number) => formatNumber(value, 0),
          },
          splitLine: {
            lineStyle: { color: "rgba(255,255,255,0.08)" },
          },
        },
      ],
      yAxis: [
        {
          type: "category",
          axisTick: {
            show: false,
          },
          axisLabel: {
            color: "rgba(244,241,234,0.64)",
          },
          data: stressScenarioData.map((row) => row.label),
        },
      ],
      series: [
        {
          name: "Profit",
          type: "bar",
          label: {
            show: true,
            position: "inside",
            color: "rgba(244,241,234,0.86)",
            fontSize: 11,
            formatter: ({ value }: { value?: number }) => (value ? formatNumber(value, 0) : ""),
          },
          itemStyle: {
            color: "#6eff8e",
            borderRadius: [0, 6, 6, 0],
          },
          emphasis: {
            focus: "series",
          },
          data: stressScenarioData.map((row) => row.profit),
        },
        {
          name: "Income",
          type: "bar",
          stack: "Total",
          label: {
            show: true,
            position: "inside",
            color: "rgba(244,241,234,0.82)",
            fontSize: 11,
            formatter: ({ value }: { value?: number }) => (value ? formatNumber(value, 0) : ""),
          },
          itemStyle: {
            color: "#7da7ff",
            borderRadius: [0, 6, 6, 0],
          },
          emphasis: {
            focus: "series",
          },
          data: stressScenarioData.map((row) => row.income),
        },
        {
          name: "Expenses",
          type: "bar",
          stack: "Total",
          label: {
            show: true,
            position: "inside",
            color: "rgba(244,241,234,0.82)",
            fontSize: 11,
            formatter: ({ value }: { value?: number }) => (value ? formatNumber(value, 0) : ""),
          },
          itemStyle: {
            color: "#ff8f8f",
            borderRadius: [6, 0, 0, 6],
          },
          emphasis: {
            focus: "series",
          },
          data: stressScenarioData.map((row) => row.expenses),
        },
      ],
    };
  }, [stressScenarioData]);
  const contributorTreemapOption = useMemo<EChartsOption | null>(() => {
    if (!contributorItems.length) return null;

    const isAbsolute = contributorViewMode === "absolute";
    const data = contributorItems.map((item) => ({
      name: item.label,
      value: isAbsolute ? Number(item.abs.toFixed(2)) : Number(item.share.toFixed(4)),
      rawAbs: item.abs,
      rawShare: item.share,
      rawNet: item.net,
      itemStyle: {
        color: item.net < 0 ? "rgba(255,143,143,0.72)" : "rgba(110,255,142,0.76)",
      },
    }));

    return {
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(10,12,17,0.96)",
        borderColor: "rgba(255,255,255,0.12)",
        borderWidth: 1,
        textStyle: { color: "rgba(244,241,234,0.9)" },
        formatter: (params: any) => {
          const abs = Number(params?.data?.rawAbs ?? 0);
          const share = Number(params?.data?.rawShare ?? 0);
          const net = Number(params?.data?.rawNet ?? 0);
          return [
            `<div style="font-weight:700;margin-bottom:4px">${params?.name ?? "—"}</div>`,
            `Вклад: ${formatNumber(abs, 2)} ${baseCurrency}`,
            `Доля: ${share.toFixed(2)}%`,
            `Направление: ${net < 0 ? "убыток" : "прибыль"}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          top: 8,
          left: 4,
          right: 4,
          bottom: 4,
          data,
          label: {
            show: true,
            position: "insideTopLeft",
            color: "rgba(244,241,234,0.94)",
            lineHeight: 16,
            fontSize: 12,
            overflow: "truncate",
            formatter: (params: any) => {
              const tail = String(params?.name ?? "").split(" · ").slice(-1)[0];
              const main = isAbsolute
                ? `${formatNumber(Number(params?.data?.rawAbs ?? 0), 0)} ${baseCurrency}`
                : `${Number(params?.data?.rawShare ?? 0).toFixed(1)}%`;
              return `{name|${tail}}\n{value|${main}}`;
            },
            rich: {
              name: {
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(244,241,234,0.96)",
              },
              value: {
                fontSize: 13,
                fontWeight: 800,
                color: "rgba(244,241,234,0.88)",
              },
            },
          },
          upperLabel: { show: false },
          itemStyle: {
            borderColor: "rgba(6,8,12,0.74)",
            borderWidth: 2,
            gapWidth: 2,
            borderRadius: 8,
          },
          levels: [
            {
              itemStyle: {
                borderColor: "rgba(6,8,12,0.74)",
                borderWidth: 2,
                gapWidth: 3,
                borderRadius: 8,
              },
            },
          ],
        },
      ],
    };
  }, [baseCurrency, contributorItems, contributorViewMode]);
  const portfolioRoseOption = useMemo<EChartsOption | null>(() => {
    if (!portfolioComposition.length) return null;

    const roseData = portfolioComposition.map((slice) => ({
      value: Number(slice.value.toFixed(2)),
      name: slice.label,
      itemStyle: {
        color: slice.color,
        borderRadius: 5,
      },
    }));

    return {
      title: {
        text: "Nightingale Chart",
        subtext: `Portfolio · ${baseCurrency}`,
        left: "center",
        top: 0,
        textStyle: { color: "rgba(244,241,234,0.9)", fontSize: 13, fontWeight: 700 },
        subtextStyle: { color: "rgba(244,241,234,0.52)", fontSize: 11 },
      },
      tooltip: {
        trigger: "item",
        formatter: "{a} <br/>{b}: {c} ({d}%)",
      },
      legend: {
        left: "center",
        top: "bottom",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: {
          color: "rgba(244,241,234,0.62)",
          fontSize: 11,
        },
        data: portfolioComposition.map((slice) => slice.label),
      },
      toolbox: {
        show: true,
        right: 0,
        top: 4,
        iconStyle: { borderColor: "rgba(244,241,234,0.62)" },
        feature: {
          mark: { show: true },
          dataView: {
            show: true,
            readOnly: false,
            optionToContent: () =>
              `<div style="padding:8px 10px;color:#d9d4c8;background:#101317;border-radius:8px">${portfolioComposition
                .map((slice) => `${slice.label}: ${formatNumber(slice.value, 2)}`)
                .join("<br/>")}</div>`,
          },
          restore: { show: true },
          saveAsImage: { show: true },
        },
      },
      series: [
        {
          name: "Radius Mode",
          type: "pie",
          radius: [20, 110],
          center: ["25%", "52%"],
          roseType: "radius",
          itemStyle: { borderRadius: 5 },
          label: { show: false },
          emphasis: { label: { show: true, color: "rgba(244,241,234,0.9)" } },
          data: roseData,
        },
        {
          name: "Area Mode",
          type: "pie",
          radius: [20, 110],
          center: ["75%", "52%"],
          roseType: "area",
          itemStyle: { borderRadius: 5 },
          label: { show: false },
          emphasis: { label: { show: true, color: "rgba(244,241,234,0.9)" } },
          data: roseData,
        },
      ],
    };
  }, [baseCurrency, portfolioComposition]);

  const metricCompositionInsights = useMemo(
    () => buildMetricCompositionInsights({ rows: contributorMetricComposition.rows, series: contributorMetricComposition.series }),
    [contributorMetricComposition.rows, contributorMetricComposition.series]
  );

  const riskConnectionInsights = useMemo(
    () => buildRiskConnectionInsights(riskConnectionData),
    [riskConnectionData]
  );

  if (!metrics) {
    return (
      <div className="importPagePlain dashboardPage dashboardPage--revamp">
        <div className="importHeroRow">
          <div>
            <h1 className="pageTitle">Панель риска</h1>
            <div className="importHeroMeta">
              <Chip color="warning" variant="soft" size="sm">Расчёт не выполнен</Chip>
              <span className="importFileTag">Нет итоговых метрик</span>
            </div>
          </div>
          <button type="button" className="importHeroNextLink" onClick={() => navigate("/configure")} aria-label="К настройке расчёта">
            <span className="importHeroNextLinkText pageTitle">К настройке расчёта</span>
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>→</span>
          </button>
        </div>

        <Card>
          <div className="cardTitle">Почему панель пустая</div>
          <div className="cardSubtitle">Нужно завершить базовые шаги и запустить расчёт из настройки.</div>
          <div className="dashboardEmptyChecklist">
            <Checklist
              items={[
                { label: "Портфель загружен", done: dataState.portfolio.positions.length > 0 },
                { label: "Критических ошибок нет", done: wf.validation.criticalErrors === 0 },
                { label: "Рыночные данные готовы", done: wf.marketData.status === "ready" && wf.marketData.missingFactors === 0 },
                { label: "Метрики выбраны", done: wf.calcConfig.selectedMetrics.length > 0 },
              ]}
            />
          </div>
          <div className="dashboardEmptyActions">
            <Button onClick={() => navigate("/configure")}>Перейти к расчёту</Button>
          </div>
        </Card>
      </div>
    );
  }

  const scenarioCount = stressRows.length || dataState.scenarios.length;
  const utilizationRounded = Math.round(utilization);
  const utilizationTone = utilization >= 100 ? "danger" : utilization >= 75 ? "warning" : "success";
  const utilizationHint = utilization >= 100 ? "Выше текущего порога" : utilization >= 75 ? "Зона контроля" : "Ниже текущего порога";
  const utilizationProgress = Math.max(0, Math.min(utilization, 100));
  const utilizationDeltaLabel = utilization >= 100
    ? `+${Math.round(utilization - 100)}% сверх порога`
    : `${Math.round(100 - utilization)}% до порога`;

  return (
    <div className="importPagePlain dashboardPage dashboardPage--revamp">
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Панель риска</h1>
          <div className="importHeroMeta">
            <Chip color={utilizationTone} variant="soft" size="sm">
              {utilization >= 100 ? "Есть превышения порогов" : utilization >= 75 ? "Требуется контроль" : "По текущим порогам без превышений"}
            </Chip>
            <span className="importFileTag">Источник порогов: {limitSourceLabel(effectiveLimitSource)}</span>
            <span className="importFileTag">Обновлено: {formatComputedAt(dataState.results.computedAt)}</span>
            <span className="importFileTag">Валюта: {baseCurrency}</span>
          </div>
        </div>
        <div className="dashboardSegmentNav" aria-label="Быстрые разделы результатов">
          <button type="button" onClick={() => navigate("/stress")}>Стрессы</button>
          <button type="button" onClick={() => navigate("/limits")}>Лимиты</button>
          <button type="button" onClick={() => navigate("/export")}>Экспорт</button>
        </div>
      </div>

      <section className="dashboardSection">
        <div className="dashboardSectionHead">
          <div className="dashboardSectionIntro">
            <div className="dashboardSectionEyebrow">Сводка</div>
            <h2 className="dashboardSectionTitle">Ключевые показатели</h2>
          </div>
          <div className="dashboardSectionMeta">
            {confidenceLabel ? <span className="dashboardSectionTag">{confidenceLabel}</span> : null}
            {horizonLabel ? <span className="dashboardSectionTag">{horizonLabel}</span> : null}
            {modeLabel ? <span className="dashboardSectionTag">{modeLabel}</span> : null}
            {isMarketDataIncomplete ? <span className="dashboardSectionTag">Market-data incomplete</span> : null}
          </div>
        </div>
        <div className="dashboardSectionBody">
          <div className="dashboardKpiGrid">
            <div className="dashboardKpiCard">
              <span className="dashboardKpiLabel">Net PV / MtM портфеля</span>
              <strong className="dashboardKpiValue">{formatOptionalNumber(metrics.base_value, 0)}</strong>
              <span className="dashboardKpiMeta">{baseCurrency}</span>
            </div>
            <div className="dashboardKpiCard">
              <span className="dashboardKpiLabel">Scenario VaR</span>
              <strong className="dashboardKpiValue">{formatOptionalNumber(varMetricValue, 0)}</strong>
              <span className="dashboardKpiMeta">{varMetricValue === null ? "не рассчитано backend" : "квантиль scenario P&L"}</span>
            </div>
            <div className="dashboardKpiCard">
              <span className="dashboardKpiLabel">Scenario ES</span>
              <strong className="dashboardKpiValue">{formatOptionalNumber(esMetricValue, 0)}</strong>
              <span className="dashboardKpiMeta">{esMetricValue === null ? "не рассчитано backend" : "средний хвост scenario P&L"}</span>
            </div>
            <div className={`dashboardKpiCard ${hasStressLoss ? "dashboardKpiCard--danger" : ""}`}>
              <span className="dashboardKpiLabel">Худший стресс</span>
              <strong className="dashboardKpiValue">{formatOptionalNumber(worstStress, 0)}</strong>
              <span className="dashboardKpiMeta">{worstStress === undefined || worstStress === null ? "не рассчитано backend" : hasStressLoss ? "негативный сценарий" : "без критики"}</span>
            </div>
            <div className={`dashboardKpiCard dashboardKpiCard--status dashboardKpiCard--${utilizationTone}`}>
              <span className="dashboardKpiLabel">Использование лимитов</span>
              <strong className="dashboardKpiValue">{utilizationRounded}%</strong>
              <span className="dashboardKpiMeta">{utilizationHint}</span>
              <div className="dashboardKpiProgress" aria-label="Утилизация лимитов">
                <span style={{ width: `${utilizationProgress}%` }} />
              </div>
            </div>
          </div>
          <div className="dashboardMicroStats">
            <span className="dashboardMicroStat">Позиции: {dataState.portfolio.positions.length}</span>
            <span className="dashboardMicroStat">Сценарии: {scenarioCount}</span>
            <span className="dashboardMicroStat">Превышения: {breachedCount}</span>
            <span className="dashboardMicroStat">{modeLabel ?? "режим api"}</span>
            <span className="dashboardMicroStat">Calculation status: {metrics.calculation_status ?? "legacy"}</span>
            <span className="dashboardMicroStat">{utilizationDeltaLabel}</span>
            <span className="dashboardMicroStat">Источник порогов: {limitSourceLabel(effectiveLimitSource)}</span>
          </div>
          {isMarketDataIncomplete ? (
            <div className="dashboardInlineNotice dashboardInlineNotice--blocked">
              <strong>Расчёт неполный: отсутствуют рыночные данные для кривых.</strong>
              <span>
                Missing: {missingCurves.join(", ")}{affectedPositions.length ? `. Affected positions: ${affectedPositions.join(", ")}` : ""}.
                Загрузите market-data bundle с нужными curves или используйте demo/default source только как preliminary.
              </span>
            </div>
          ) : null}
          {preliminaryLimits ? (
            <div className="dashboardInlineNotice dashboardInlineNotice--blocked">
              <strong>Предварительный контроль · {limitSourceStatus(effectiveLimitSource)}</strong>
              <span>{limitSourceDescription(effectiveLimitSource)}</span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="dashboardSection">
        <div className="dashboardSectionHead">
          <div className="dashboardSectionIntro">
            <div className="dashboardSectionEyebrow">Мониторинг</div>
            <h2 className="dashboardSectionTitle">Рабочий экран риска</h2>
          </div>
          <div className="dashboardSectionMeta">
            <span className="dashboardSectionTag">{stressTrendData.length} сценариев</span>
            <span className="dashboardSectionTag">{contributorItems.length || 0} вкладчиков</span>
          </div>
        </div>
        <div className="dashboardSectionBody">
          {validationLogEntries.length > 0 || correlationRefresh.status !== "idle" ? (
            <div className="dashboardNoticeRail">
              {validationLogEntries.length > 0 ? (
                <div className="dashboardInlineNoticeWrap">
                  <button
                    type="button"
                    className="dashboardInlineNotice dashboardInlineNotice--button"
                    aria-label="Журнал валидации расчёта"
                    aria-expanded={validationLogExpanded}
                    aria-controls="dashboard-validation-log"
                    onClick={() => setValidationLogExpanded((value) => !value)}
                  >
                    <span>
                      <strong>Журнал валидации</strong>
                      <small>{validationLogEntries.length} записей</small>
                    </span>
                    <span aria-hidden="true">{validationLogExpanded ? "↑" : "↓"}</span>
                  </button>
                  {validationLogExpanded ? (
                    <div
                      id="dashboard-validation-log"
                      className="dashboardValidationLogPanel dashboardValidationLogPanel--compact"
                      aria-label="Validation log"
                    >
                      <div className="dashboardValidationLogList">
                        {visibleValidationLogEntries.map((entry, index) => (
                          <div key={`${entry.severity}-${entry.row ?? "all"}-${entry.field ?? "field"}-${index}`} className="dashboardValidationLogEntry">
                            <Chip
                              color={entry.severity === "ERROR" ? "danger" : entry.severity === "WARNING" ? "warning" : "primary"}
                              variant="flat"
                              radius="sm"
                              size="sm"
                            >
                              {entry.severity}
                            </Chip>
                            <div className="dashboardValidationLogText">
                              <strong>
                                {entry.row ? `Строка ${entry.row}` : "Общее"}
                                {entry.field ? ` · ${entry.field}` : ""}
                              </strong>
                              <span>{entry.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {isLargeValidationLog && !validationLogShowAll ? (
                        <Button variant="secondary" onClick={() => setValidationLogShowAll(true)}>
                          Показать все {validationLogEntries.length} записей
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {correlationRefresh.status !== "idle" ? (
                <div className={`dashboardInlineNotice dashboardInlineNotice--${correlationRefresh.status}`}>
                  <span>
                    <strong>{correlationRefresh.label}</strong>
                    {correlationRefresh.detail ? <small>{correlationRefresh.detail}</small> : null}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="dashboardCoreGrid">
            <Reveal>
              <GlassPanel
                className="dashboardCompactPanel dashboardCompactPanel--workspace"
                title="Профиль stress P&L"
                badge={<Chip color={hasStressLoss ? "danger" : "success"} variant="flat" radius="sm">{stressTrendData.length} сцен.</Chip>}
              >
                <AreaTrendChart data={stressTrendData} color="#7da7ff" accent="#6eff8e" showSecondary height={DASHBOARD_CHART_HEIGHT} />
                <InlineChartCaption item={workspaceStressCaption} />
                <div className="dashboardMiniStatGrid">
                  <div className="dashboardMiniStat">
                    <span>Худший стресс</span>
                    <strong>{formatOptionalNumber(worstStress, 2)}</strong>
                  </div>
                  <div className="dashboardMiniStat">
                    <span>Сценарии</span>
                    <strong>{scenarioCount}</strong>
                  </div>
                  <div className="dashboardMiniStat">
                    <span>Превышения</span>
                    <strong>{breachedCount}</strong>
                  </div>
                </div>
              </GlassPanel>
            </Reveal>
            <Reveal delay={0.05}>
              <GlassPanel
                className="dashboardCompactPanel dashboardCompactPanel--workspace"
                title="Крупнейшие вкладчики"
                badge={<Chip color="primary" variant="flat" radius="sm">{contributorItems.length || 0} строк</Chip>}
              >
                <div className="dashboardContributorToolbar">
                  <ButtonGroup variant="secondary" className="dashboardContributorModeGroup">
                    <HeroButton
                      onPress={() => setContributorViewMode("absolute")}
                      className={`dashboardContributorModeBtn ${contributorViewMode === "absolute" ? "dashboardContributorModeBtn--active" : ""}`}
                    >
                      RUB
                    </HeroButton>
                    <HeroButton
                      onPress={() => setContributorViewMode("share")}
                      className={`dashboardContributorModeBtn ${contributorViewMode === "share" ? "dashboardContributorModeBtn--active" : ""}`}
                    >
                      %
                    </HeroButton>
                  </ButtonGroup>
                </div>
                <InteractiveRiskChart
                  option={contributorTreemapOption}
                  emptyText="Недостаточно данных по вкладчикам."
                  chartId={`dashboard-contributors-treemap-${contributorViewMode}`}
                  height={DASHBOARD_CHART_HEIGHT + 82}
                />
                <InlineChartCaption item={contributorCaption} />
              </GlassPanel>
            </Reveal>
            <Reveal delay={0.1}>
              <GlassPanel
                className="dashboardCompactPanel dashboardCompactPanel--workspace"
                title="Пороги и алерты"
                badge={<Chip color={utilizationTone} variant="flat" radius="sm">{utilizationRounded}%</Chip>}
              >
                {limitOverviewRows.length ? (
                  <>
                    <div className="dashboardMiniStatGrid dashboardMiniStatGrid--limits">
                      <div className="dashboardMiniStat">
                        <span>Нарушения</span>
                        <strong className={breachedLimitsCount > 0 ? "dashboardValueNegative" : ""}>{breachedLimitsCount}</strong>
                      </div>
                      <div className="dashboardMiniStat">
                        <span>Худшая загрузка</span>
                        <strong>{formatNumber(closestLimitRow?.utilizationPct ?? 0, 1)}%</strong>
                      </div>
                      <div className="dashboardMiniStat">
                        <span>Критичный порог</span>
                        <strong>{closestLimitRow ? formatMetricLabel(closestLimitRow.metric) : "—"}</strong>
                      </div>
                    </div>
                    <AppTable
                      ariaLabel="Приоритет лимитов"
                      headers={["Метрика", "Факт", "Лимит", "Загрузка"]}
                      rows={limitOverviewRows.slice(0, 5).map((row) => ({
                        key: row.metric,
                        cells: [
                          formatMetricLabel(row.metric),
                          <span key={`${row.metric}-fact`} className={row.breached ? "dashboardValueNegative" : ""}>
                            {formatNumber(row.value, 2)}
                          </span>,
                          formatNumber(row.limit, 2),
                          <span key={`${row.metric}-util`} className={row.breached ? "dashboardValueNegative" : ""}>
                            {formatNumber(row.utilizationPct, 1)}%
                          </span>,
                        ],
                      }))}
                    />
                  </>
                ) : (
                  <div className="dashboardPanelHint">
                    Пороги не применены. Откройте страницу контрольных порогов, чтобы выбрать draft auto или ручной режим.
                  </div>
                )}
              </GlassPanel>
            </Reveal>
            <Reveal delay={0.15}>
              <GlassPanel
                className="dashboardCompactPanel dashboardCompactPanel--workspace"
                title="Ключевые показатели"
              >
                <div className="dashboardKeyMetricGrid">
                  <div className="dashboardKeyMetricCard dashboardKeyMetricCard--danger">
                    <span>VaR</span>
                    <strong>{varMetricValue === null ? "—" : formatNumber(varMetricValue, 0)}</strong>
                    <small>{varMetricValue === null ? "не рассчитано" : `${formatNumber(varSharePct, 1)}% от портфеля`}</small>
                  </div>
                  <div className="dashboardKeyMetricCard dashboardKeyMetricCard--warning">
                    <span>ES</span>
                    <strong>{esMetricValue === null ? "—" : formatNumber(esMetricValue, 0)}</strong>
                    <small>{esMetricValue === null ? "не рассчитано" : `${formatNumber(esSharePct, 1)}% от портфеля`}</small>
                  </div>
                  <div className="dashboardKeyMetricCard">
                    <span>LC VaR</span>
                    <strong>{formatOptionalNumber(lcVarValue, 0)}</strong>
                    <small>{lcVarSharePct === null ? "не рассчитано" : `${formatNumber(lcVarSharePct, 1)}% от портфеля`}</small>
                  </div>
                  <div className="dashboardKeyMetricCard">
                    <span>Покрытие капиталом</span>
                    <strong>{capitalCoveragePct === null ? "—" : `${formatNumber(capitalCoveragePct, 1)}%`}</strong>
                    <small>{varMetricValue === null || capitalValue === null ? "VaR/капитал не рассчитан" : `${formatNumber(capitalValue, 0)} к ${formatNumber(varValue, 0)}`}</small>
                  </div>
                  <div className="dashboardKeyMetricCard">
                    <span>Начальная маржа</span>
                    <strong>{formatOptionalNumber(initialMarginValue, 0)}</strong>
                    <small>{marginLoadPct === null ? "не рассчитано" : `${formatNumber(marginLoadPct, 1)}% от портфеля`}</small>
                  </div>
                  <div className={`dashboardKeyMetricCard ${hasStressLoss ? "dashboardKeyMetricCard--danger" : ""}`}>
                    <span>Худший стресс</span>
                    <strong>{formatOptionalNumber(worstStress, 0)}</strong>
                    <small>{hasStressLoss ? "негативный сценарий" : "без критики"}</small>
                  </div>
                </div>
              </GlassPanel>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="dashboardSection">
        <div className="dashboardSectionHead">
          <div className="dashboardSectionIntro">
            <div className="dashboardSectionEyebrow">Детали</div>
            <h2 className="dashboardSectionTitle">Таблицы и разрезы</h2>
          </div>
          <div className="dashboardSectionMeta">
            <span className="dashboardSectionTag">валюта {baseCurrency}</span>
            <span className="dashboardSectionTag">utilization {Math.round(utilization)}%</span>
          </div>
        </div>
        <div className="dashboardSectionBody">
          <AppTabs
            ariaLabel="Вкладки результатов риска"
            tabStyle="ghostGroup"
            tabs={[
              {
                id: "stress",
                label: "Стрессы",
                content: (
                  <div className="dashboardDetailGrid dashboardDetailGrid--single">
                    <GlassPanel className="dashboardCompactPanel dashboardCompactPanel--stressPlain" title="Stress P&L по сценариям">
                      <div className="dashboardStressSplit">
                        <div className="dashboardStressChart">
                          <InteractiveRiskChart
                            option={stressScenarioOption}
                            emptyText="Стресс-сценарии не рассчитывались."
                            chartId="dashboard-stress-scenarios-bars"
                            height={DASHBOARD_STRESS_TAB_HEIGHT}
                          />
                          <InlineChartCaption item={stressTabCaption} className="dashboardStressChartCaption" />
                        </div>
                        <div className="dashboardStressTableWrap">
                          <Table variant="secondary" className="dashboardStressTable">
                            <Table.ScrollContainer>
                              <Table.Content aria-label="Стресс-сценарии" className="dashboardStressTableContent">
                                <Table.Header>
                                  <Table.Column isRowHeader>Сценарий</Table.Column>
                                  <Table.Column>P&L</Table.Column>
                                </Table.Header>
                                <Table.Body>
                                  {stressScenarioData.map((row) => (
                                    <Table.Row key={row.key}>
                                      <Table.Cell>{row.label}</Table.Cell>
                                      <Table.Cell className={row.pnl < 0 ? "dashboardValueNegative" : "dashboardValuePositive"}>
                                        {formatNumber(row.pnl, 2)}
                                      </Table.Cell>
                                    </Table.Row>
                                  ))}
                                </Table.Body>
                              </Table.Content>
                            </Table.ScrollContainer>
                          </Table>
                        </div>
                      </div>
                    </GlassPanel>
                  </div>
                ),
              },
              {
                id: "structure",
                label: "Структура",
                content: (
                  <div className="dashboardCardGrid dashboardCardGrid--three">
                    <GlassPanel
                      className="dashboardCompactPanel dashboardCompactPanel--portfolio"
                      title="Структура портфеля"
                      badge={<Chip color="primary" variant="flat" radius="sm">{portfolioComposition.length || 1} сегм.</Chip>}
                    >
                      <InteractiveRiskChart
                        option={portfolioRoseOption}
                        emptyText="Структура портфеля недоступна."
                        chartId="dashboard-portfolio-rose"
                        height={DASHBOARD_INSIGHT_HEIGHT + 70}
                      />
                      <ChartInsights items={compositionInsights} />
                    </GlassPanel>
                    <GlassPanel
                      className="dashboardCompactPanel"
                      title="Композиция риска по метрикам"
                      badge={<Chip color="default" variant="flat" radius="sm">{contributorMetricComposition.rows.length || 0} метр.</Chip>}
                    >
                      <MetricCompositionChart
                        data={contributorMetricComposition.rows}
                        series={contributorMetricComposition.series}
                        height={DASHBOARD_INSIGHT_HEIGHT}
                      />
                      <ChartInsights items={metricCompositionInsights} />
                    </GlassPanel>
                    <GlassPanel className="dashboardCompactPanel" title="Карта связей риска">
                      <RiskConnectionMap
                        metrics={riskConnectionData.metrics}
                        positions={riskConnectionData.positions}
                        links={riskConnectionData.links}
                        height={DASHBOARD_NETWORK_HEIGHT}
                      />
                      <ChartInsights items={riskConnectionInsights} />
                    </GlassPanel>
                  </div>
                ),
              },
              {
                id: "factors",
                label: "Факторы",
                content: (
                  <div className="dashboardFactorBlock">
                    <GlassPanel className="dashboardCompactPanel dashboardFactorCard" title="Корреляции P&L">
                      <CorrelationMatrix matrix={correlationView.matrix} labels={correlationView.labels} size={correlationMatrixSize} />
                    </GlassPanel>
                    <GlassPanel className="dashboardCompactPanel dashboardFactorCard" title="Капитал и маржа">
                      <AppTable
                        ariaLabel="Сводка по капиталу и марже"
                        headers={["Показатель", "Значение"]}
                        rows={[
                          {
                            key: "utilization",
                            cells: ["Загрузка порогов", <span className="dashboardFactorValue">{Math.round(utilization)}%</span>],
                          },
                          {
                            key: "status",
                            cells: [
                              "Статус",
                              <Chip
                                key="utilization-status"
                                color={utilization >= 100 ? "danger" : utilization >= 75 ? "warning" : "success"}
                                variant="flat"
                                radius="sm"
                              >
                                {utilizationStatusLabel}
                              </Chip>,
                            ],
                          },
                          {
                            key: "lcvar",
                            cells: ["LC VaR", <span className="dashboardFactorValue">{formatOptionalNumber(metrics.lc_var, 2)}</span>],
                          },
                          {
                            key: "capital",
                            cells: ["Капитал", <span className="dashboardFactorValue">{formatOptionalNumber(metrics.capital, 2)}</span>],
                          },
                          {
                            key: "initial-margin",
                            cells: ["Начальная маржа", <span className="dashboardFactorValue">{formatOptionalNumber(metrics.initial_margin, 2)}</span>],
                          },
                          {
                            key: "variation-margin",
                            cells: ["Reference scenario P&L", <span className="dashboardFactorValue">{formatOptionalNumber(metrics.variation_margin, 2)}</span>],
                          },
                          {
                            key: "flow",
                            cells: [
                              "Приток / отток",
                              <span className="dashboardFactorFlow">
                                <span className={`dashboardFactorValue ${capitalInflow >= 0 ? "dashboardValuePositive" : "dashboardValueNegative"}`}>
                                  {capitalInflow >= 0 ? `+${capitalInflow.toFixed(1)}` : capitalInflow.toFixed(1)}%
                                </span>
                                <span className={`dashboardFactorValue ${variationOutflow >= 0 ? "dashboardValuePositive" : "dashboardValueNegative"}`}>
                                  {variationOutflow >= 0 ? `+${variationOutflow.toFixed(1)}` : variationOutflow.toFixed(1)}%
                                </span>
                              </span>,
                            ],
                          },
                        ]}
                      />
                    </GlassPanel>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </section>

    </div>
  );
}
