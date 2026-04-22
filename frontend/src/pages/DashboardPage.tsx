import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { Chip, Table, Button as HeroButton, ButtonGroup } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import AppTabs from "../components/AppTabs";
import AppTable from "../components/AppTable";
import Button from "../components/Button";
import Checklist from "../components/Checklist";
import InteractiveRiskChart from "../components/InteractiveRiskChart";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { PositionDTO } from "../api/types";
import { CorrelationMatrix } from "../components/monolith/visuals";
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

const METRIC_LABELS: Record<string, string> = {
  stress: "Stress",
  var_hist: "Hist VaR",
  es_hist: "Hist ES",
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

export default function DashboardPage() {
  const navigate = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const metrics = dataState.results.metrics;
  const [contributorViewMode, setContributorViewMode] = useState<"absolute" | "share">("absolute");

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
  }, [metrics, dispatch]);

  const baseCurrency = String(
    metrics?.base_currency ?? wf.calcConfig.params?.baseCurrency ?? dataState.portfolio.positions[0]?.currency ?? "RUB"
  ).toUpperCase();

  const stressRows = useMemo<StressRow[]>(() => metrics?.stress ?? [], [metrics?.stress]);
  const contributorItems = useMemo(() => {
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

  const correlations = metrics?.correlations ?? [];
  const utilization = useMemo(() => {
    const rawLimits = metrics?.limits;
    if (rawLimits?.length) {
      return Math.max(...rawLimits.map(([, value, limit]) => (limit ? Math.abs(value / limit) * 100 : 0)), 0);
    }
    if (metrics?.lc_var && metrics?.base_value) {
      return Math.abs(metrics.lc_var / metrics.base_value) * 100;
    }
    return 0;
  }, [metrics?.base_value, metrics?.lc_var, metrics?.limits]);

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
  const stressScenarioData = useMemo(
    () =>
      (stressRows.length ? stressRows : [{ scenario_id: "base", pnl: 0, limit: 0, breached: false }]).map((row, index) => {
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
  const hasStressLoss = worstStress !== undefined && worstStress < 0;
  const varValue = metrics.var_hist ?? metrics.var_param ?? 0;
  const esValue = metrics.es_hist ?? metrics.es_param ?? 0;

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
  const lcVarValue = metrics.lc_var ?? 0;
  const capitalValue = metrics.capital ?? 0;
  const initialMarginValue = metrics.initial_margin ?? 0;
  const baseValueAbs = Math.max(Math.abs(metrics.base_value ?? 0), 1);
  const varSharePct = (Math.abs(varValue) / baseValueAbs) * 100;
  const esSharePct = (Math.abs(esValue) / baseValueAbs) * 100;
  const lcVarSharePct = (Math.abs(lcVarValue) / baseValueAbs) * 100;
  const capitalCoveragePct = Math.abs(varValue) > 0 ? (capitalValue / Math.abs(varValue)) * 100 : 0;
  const marginLoadPct = (Math.abs(initialMarginValue) / baseValueAbs) * 100;

  const correlationLabels = useMemo(
    () => dataState.portfolio.positions.map((position) => position.position_id),
    [dataState.portfolio.positions]
  );
  const correlationMatrixSize = Math.min(Math.max(correlationLabels.length, 2), 5);
  const capitalInflow = metrics?.capital && metrics?.base_value ? (metrics.capital / metrics.base_value) * 100 : 0;
  const variationOutflow = metrics?.variation_margin && metrics?.base_value ? (-metrics.variation_margin / metrics.base_value) * 100 : 0;
  const utilizationStatusLabel = utilization >= 100 ? "критическая зона" : utilization >= 75 ? "зона контроля" : "спокойная зона";
  const confidenceLabel = metrics?.confidence_level ? `${Math.round(metrics.confidence_level * 100)}% confidence` : null;
  const horizonLabel = metrics?.horizon_days ? `${metrics.horizon_days} дн. горизонт` : null;
  const modeLabel = metrics?.mode ? `режим ${metrics.mode}` : null;

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
  const utilizationHint = utilization >= 100 ? "Лимит превышен" : utilization >= 75 ? "Зона контроля" : "В пределах лимита";
  const utilizationProgress = Math.max(0, Math.min(utilization, 100));
  const utilizationDeltaLabel = utilization >= 100
    ? `+${Math.round(utilization - 100)}% сверх лимита`
    : `${Math.round(100 - utilization)}% до лимита`;

  return (
    <div className="importPagePlain dashboardPage dashboardPage--revamp">
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Панель риска</h1>
          <div className="importHeroMeta">
            <Chip color={utilizationTone} variant="soft" size="sm">
              {utilization >= 100 ? "Есть превышения" : utilization >= 75 ? "Требуется контроль" : "Риск в норме"}
            </Chip>
            <span className="importFileTag">Обновлено: {formatComputedAt(dataState.results.computedAt)}</span>
            <span className="importFileTag">Валюта: {baseCurrency}</span>
          </div>
        </div>
        <div className="dashboardHeroActions">
          <Button variant="secondary" onClick={() => navigate("/stress")}>Стрессы</Button>
          <Button variant="secondary" onClick={() => navigate("/limits")}>Лимиты</Button>
          <Button variant="secondary" onClick={() => navigate("/export")}>Экспорт</Button>
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
          </div>
        </div>
        <div className="dashboardSectionBody">
          <div className="dashboardKpiGrid">
            <div className="dashboardKpiCard">
              <span className="dashboardKpiLabel">Стоимость портфеля</span>
              <strong className="dashboardKpiValue">{formatNumber(metrics.base_value ?? 0, 0)}</strong>
              <span className="dashboardKpiMeta">{baseCurrency}</span>
            </div>
            <div className="dashboardKpiCard">
              <span className="dashboardKpiLabel">VaR</span>
              <strong className="dashboardKpiValue">{formatNumber(varValue, 0)}</strong>
              <span className="dashboardKpiMeta">пороговый убыток</span>
            </div>
            <div className="dashboardKpiCard">
              <span className="dashboardKpiLabel">ES</span>
              <strong className="dashboardKpiValue">{formatNumber(esValue, 0)}</strong>
              <span className="dashboardKpiMeta">средний хвост</span>
            </div>
            <div className={`dashboardKpiCard ${hasStressLoss ? "dashboardKpiCard--danger" : ""}`}>
              <span className="dashboardKpiLabel">Худший стресс</span>
              <strong className="dashboardKpiValue">{formatNumber(worstStress ?? 0, 0)}</strong>
              <span className="dashboardKpiMeta">{hasStressLoss ? "негативный сценарий" : "без критики"}</span>
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
            <span className="dashboardMicroStat">{utilizationDeltaLabel}</span>
          </div>
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
          <div className="dashboardCoreGrid">
            <Reveal>
              <GlassPanel
                className="dashboardCompactPanel dashboardCompactPanel--workspace"
                title="Профиль stress P&L"
                badge={<Chip color={worstStress !== undefined && worstStress < 0 ? "danger" : "success"} variant="flat" radius="sm">{stressTrendData.length} сцен.</Chip>}
              >
                <AreaTrendChart data={stressTrendData} color="#7da7ff" accent="#6eff8e" showSecondary height={DASHBOARD_CHART_HEIGHT} />
                <div className="dashboardMiniStatGrid">
                  <div className="dashboardMiniStat">
                    <span>Худший стресс</span>
                    <strong>{formatNumber(worstStress ?? 0, 2)}</strong>
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
              </GlassPanel>
            </Reveal>
            <Reveal delay={0.1}>
              <GlassPanel
                className="dashboardCompactPanel dashboardCompactPanel--workspace"
                title="Лимиты и алерты"
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
                        <span>Критичный лимит</span>
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
                    Лимиты не переданы в расчёт. Для этого портфеля доступна только общая загрузка: <strong>{utilizationRounded}%</strong>.
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
                    <strong>{formatNumber(varValue, 0)}</strong>
                    <small>{formatNumber(varSharePct, 1)}% от портфеля</small>
                  </div>
                  <div className="dashboardKeyMetricCard dashboardKeyMetricCard--warning">
                    <span>ES</span>
                    <strong>{formatNumber(esValue, 0)}</strong>
                    <small>{formatNumber(esSharePct, 1)}% от портфеля</small>
                  </div>
                  <div className="dashboardKeyMetricCard">
                    <span>LC VaR</span>
                    <strong>{formatNumber(lcVarValue, 0)}</strong>
                    <small>{formatNumber(lcVarSharePct, 1)}% от портфеля</small>
                  </div>
                  <div className="dashboardKeyMetricCard">
                    <span>Покрытие капиталом</span>
                    <strong>{formatNumber(capitalCoveragePct, 1)}%</strong>
                    <small>{formatNumber(capitalValue, 0)} к {formatNumber(varValue, 0)}</small>
                  </div>
                  <div className="dashboardKeyMetricCard">
                    <span>Начальная маржа</span>
                    <strong>{formatNumber(initialMarginValue, 0)}</strong>
                    <small>{formatNumber(marginLoadPct, 1)}% от портфеля</small>
                  </div>
                  <div className={`dashboardKeyMetricCard ${hasStressLoss ? "dashboardKeyMetricCard--danger" : ""}`}>
                    <span>Худший стресс</span>
                    <strong>{formatNumber(worstStress ?? 0, 0)}</strong>
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
                  <CorrelationMatrix matrix={correlations} labels={correlationLabels} size={correlationMatrixSize} />
                </GlassPanel>
                <GlassPanel className="dashboardCompactPanel dashboardFactorCard" title="Капитал и маржа">
                  <AppTable
                    ariaLabel="Сводка по капиталу и марже"
                    headers={["Показатель", "Значение"]}
                    rows={[
                      {
                        key: "utilization",
                        cells: ["Загрузка лимитов", <span className="dashboardFactorValue">{Math.round(utilization)}%</span>],
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
                        cells: ["LC VaR", <span className="dashboardFactorValue">{formatNumber(metrics.lc_var ?? 0, 2)}</span>],
                      },
                      {
                        key: "capital",
                        cells: ["Капитал", <span className="dashboardFactorValue">{formatNumber(metrics.capital ?? 0, 2)}</span>],
                      },
                      {
                        key: "initial-margin",
                        cells: ["Начальная маржа", <span className="dashboardFactorValue">{formatNumber(metrics.initial_margin ?? 0, 2)}</span>],
                      },
                      {
                        key: "variation-margin",
                        cells: ["Вариационная маржа", <span className="dashboardFactorValue">{formatNumber(metrics.variation_margin ?? 0, 2)}</span>],
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
