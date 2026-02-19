import { useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import HelpTooltip from "../components/HelpTooltip";
import InteractiveRiskChart from "../components/InteractiveRiskChart";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";

type DashboardChartKey = "pnl_distribution" | "stress_pnl" | "lc_breakdown" | "contributors";

type StressRow = {
  scenario_id: string;
  pnl: number;
  limit?: number | null;
  breached: boolean;
};

type LcBreakdownRow = {
  position_id: string;
  model: string;
  quantity: number;
  position_value: number;
  haircut_input: number;
  add_on_money: number;
};

type ContributorRow = {
  metric?: string;
  position_id: string;
  scenario_id?: string;
  pnl_contribution: number;
  abs_pnl_contribution: number;
};

type ChartDefinition = {
  key: DashboardChartKey;
  label: string;
  description: string;
  option: EChartsOption | null;
  available: boolean;
  emptyText: string;
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const m = dataState.results.metrics;
  const [selectedChart, setSelectedChart] = useState<DashboardChartKey>("pnl_distribution");

  useEffect(() => {
    if (m) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
  }, [m, dispatch]);

  const worstStress = useMemo(() => {
    if (!m?.stress?.length) return undefined;
    return Math.min(...m.stress.map((s) => s.pnl));
  }, [m]);
  const baseCurrency = useMemo(
    () => String(m?.base_currency ?? wf.calcConfig.params?.baseCurrency ?? dataState.portfolio.positions[0]?.currency ?? "RUB").toUpperCase(),
    [m?.base_currency, wf.calcConfig.params?.baseCurrency, dataState.portfolio.positions]
  );
  const confidenceLevel = Number(m?.confidence_level ?? wf.calcConfig.params?.alpha ?? 0.99);
  const horizonDays = Number(m?.horizon_days ?? wf.calcConfig.params?.horizonDays ?? 10);
  const mode = String(m?.mode ?? (((import.meta as any).env?.VITE_DEMO_MODE ?? "1") === "1" ? "demo" : "api"));
  const topVar = (m?.top_contributors?.var_hist ?? []) as ContributorRow[];
  const topEs = (m?.top_contributors?.es_hist ?? []) as ContributorRow[];
  const topStress = (m?.top_contributors?.stress ?? []) as ContributorRow[];
  const stressRows = (m?.stress ?? []) as StressRow[];
  const lcRows = (m?.lc_var_breakdown ?? []) as LcBreakdownRow[];
  const pnlDistribution = (m?.pnl_distribution ?? []) as number[];

  const consolidatedContributors = useMemo(
    () =>
      [...topVar, ...topEs, ...topStress]
        .filter((row) => Number.isFinite(row.pnl_contribution))
        .sort((a, b) => b.abs_pnl_contribution - a.abs_pnl_contribution)
        .slice(0, 12),
    [topVar, topEs, topStress]
  );

  const chartDefinitions = useMemo<ChartDefinition[]>(() => {
    const pnlOption = buildPnlDistributionOption({
      pnlDistribution,
      varHist: m?.var_hist,
      esHist: m?.es_hist,
      baseCurrency,
    });
    const stressOption = buildStressOption({ rows: stressRows, baseCurrency });
    const lcOption = buildLiquidityBreakdownOption({ rows: lcRows, baseCurrency });
    const contributorsOption = buildContributorsOption({ rows: consolidatedContributors, baseCurrency });

    return [
      {
        key: "pnl_distribution",
        label: "Распределение PnL",
        description: "Распределение портфельного PnL (хуже -> лучше) с линиями VaR/ES.",
        option: pnlOption,
        available: Boolean(pnlOption),
        emptyText: "Нет массива PnL. Запустите расчёт VaR/ES со сценариями.",
      },
      {
        key: "stress_pnl",
        label: "Stress PnL",
        description: "P&L по стресс-сценариям с цветовым выделением убытков и превышений.",
        option: stressOption,
        available: Boolean(stressOption),
        emptyText: "Нет стресс-сценариев для отображения.",
      },
      {
        key: "lc_breakdown",
        label: "LC add-on",
        description: "Декомпозиция ликвидностной надбавки LC VaR по позициям (в деньгах).",
        option: lcOption,
        available: Boolean(lcOption),
        emptyText: "Нет ликвидностной надбавки по позициям (все haircut=0).",
      },
      {
        key: "contributors",
        label: "Top contributors",
        description: "Кто вносит наибольший вклад в риск (|ΔPnL|) по VaR/ES/Stress.",
        option: contributorsOption,
        available: Boolean(contributorsOption),
        emptyText: "Нет данных о вкладчиках риска для текущего расчёта.",
      },
    ];
  }, [baseCurrency, consolidatedContributors, lcRows, m?.es_hist, m?.var_hist, pnlDistribution, stressRows]);

  useEffect(() => {
    const active = chartDefinitions.find((chart) => chart.key === selectedChart);
    if (active?.available) return;
    const firstAvailable = chartDefinitions.find((chart) => chart.available);
    if (firstAvailable) setSelectedChart(firstAvailable.key);
  }, [chartDefinitions, selectedChart]);

  const activeChart = chartDefinitions.find((chart) => chart.key === selectedChart) ?? chartDefinitions[0];

  if (!m) {
    return (
      <Card>
        <h1 className="pageTitle">Шаг 6. Панель риска</h1>
        <p className="pageHint">Пока нет результатов. Сначала запустите расчёт, и здесь появятся метрики и графики.</p>
        <Button onClick={() => navigate("/run")}>Перейти к запуску</Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 6. Панель риска</h1>
          <p className="pageHint">Главный экран: где риск и за счёт чего. Детали — через «Стрессы» и «Лимиты».</p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => navigate("/stress")}>Открыть стрессы</Button>
          <Button variant="secondary" onClick={() => navigate("/limits")}>Открыть лимиты</Button>
          <Button variant="secondary" onClick={() => navigate("/export")}>Экспорт</Button>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
        <span className="badge ok">Валюта: {baseCurrency}</span>
        <span className="badge ok">CL: {confidenceLevel.toFixed(4)}</span>
        <span className="badge ok">Горизонт: {horizonDays}д</span>
        <span className={mode === "demo" ? "badge warn" : "badge ok"}>Mode: {mode}</span>
      </div>
      {m.fx_warning && <div className="badge warn" style={{ marginTop: 10 }}>{m.fx_warning}</div>}
      {m.methodology_note && <div className="badge warn" style={{ marginTop: 10 }}>{m.methodology_note}</div>}

      <div className="grid" style={{ marginTop: 12 }}>
        <KPI label={`Стоимость портфеля (${baseCurrency})`} value={m.base_value} tooltip="Суммарная стоимость (PV) по выбранной модели, в базовой валюте отчёта." />
        <KPI
          label={`VaR (${baseCurrency})`}
          value={m.var_hist ?? undefined}
          tooltip={`Historical VaR: дискретный квантиль без интерполяции, CL=${confidenceLevel.toFixed(4)}. Потери отображаются положительным числом.`}
        />
        <KPI
          label={`ES (${baseCurrency})`}
          value={m.es_hist ?? undefined}
          tooltip="ES: средний убыток по худшему хвосту, включая VaR-точку."
        />
        <KPI
          label={`LC VaR (${baseCurrency})`}
          value={m.lc_var ?? undefined}
          tooltip="LC VaR = VaR + Liquidity add-on. Add-on считается в деньгах в той же валюте, что и VaR."
        />
        <KPI label={`Худший стресс P&L (${baseCurrency})`} value={worstStress} tooltip="Минимальный P&L среди выбранных стресс‑сценариев." />
        <KPI label={`Initial Margin (${baseCurrency})`} value={m.initial_margin ?? undefined} tooltip="Оценка требуемой маржи (демо)." />
      </div>

      <div style={{ marginTop: 12 }}>
        <Card className="riskChartsCard">
          <div className="row wrap" style={{ justifyContent: "space-between", gap: 12 }}>
            <div>
              <div className="cardTitle">Визуализация расчёта</div>
              <div className="cardSubtitle">
                {activeChart?.description ?? "Выберите график, чтобы увидеть, как сформировались итоговые метрики."}
              </div>
            </div>
            <div className="chartSelector" role="tablist" aria-label="Выбор графика на дашборде">
              {chartDefinitions.map((chart) => (
                <button
                  key={chart.key}
                  type="button"
                  role="tab"
                  aria-selected={selectedChart === chart.key}
                  className={`chartSelectorBtn ${selectedChart === chart.key ? "chartSelectorBtn--active" : ""}`}
                  onClick={() => setSelectedChart(chart.key)}
                  disabled={!chart.available}
                  title={chart.available ? chart.description : chart.emptyText}
                >
                  {chart.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <InteractiveRiskChart
              option={activeChart?.option ?? null}
              emptyText={activeChart?.emptyText ?? "Нет данных для визуализации."}
              chartId={activeChart?.key ?? "empty"}
            />
          </div>
        </Card>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <Card>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div className="cardTitle">
              Чувствительности (Greeks) <HelpTooltip text="Показывают, что сильнее всего влияет на стоимость: цена, вола, ставка. DV01 — чувствительность к +1 б.п." />
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 12 }}>
            {m.greeks &&
              Object.entries(m.greeks).map(([k, v]) => (
                <span key={k} className="badge ok" title={String(v)}>
                  {k.toUpperCase()}: {formatNumber(v, 4)}
                </span>
              ))}
            {!m.greeks && <span className="textMuted">Не считали Greeks (включите в настройках).</span>}
          </div>
        </Card>

        <Card>
          <div className="cardTitle">Fact vs Limit (сводно)</div>
          <div className="cardSubtitle">Подробности — в разделе «Лимиты».</div>
          <div className="stack" style={{ marginTop: 12 }}>
            {(m.limits ?? []).slice(0, 6).map(([metric, value, limit, breached]) => (
              <div key={metric} className={breached ? "badge danger" : "badge ok"} title={String(value)}>
                {metric}: {formatNumber(value)} / лимит {limit}
              </div>
            ))}
            {!m.limits?.length && <div className="textMuted">Лимитов нет (или не переданы).</div>}
          </div>
        </Card>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <Card>
          <div className="cardTitle">LC VaR breakdown</div>
          <div className="cardSubtitle">
            LC VaR = {m.var_hist?.toFixed(2) ?? "—"} + {m.lc_var_addon?.toFixed(2) ?? "—"} = {m.lc_var?.toFixed(2) ?? "—"} {baseCurrency}
          </div>
          <div className="textMuted" style={{ marginTop: 8 }}>
            Модель ликвидности: <span className="code">{m.liquidity_model ?? "fraction_of_position_value"}</span>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table sticky">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Qty</th>
                  <th>PV</th>
                  <th>Haircut</th>
                  <th>Add-on ({baseCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {(m.lc_var_breakdown ?? []).map((row) => (
                  <tr key={row.position_id}>
                    <td>{row.position_id}</td>
                    <td>{formatNumber(row.quantity, 4)}</td>
                    <td>{formatNumber(row.position_value, 2)}</td>
                    <td>{formatNumber(row.haircut_input, 4)}</td>
                    <td>{formatNumber(row.add_on_money, 2)}</td>
                  </tr>
                ))}
                {!(m.lc_var_breakdown ?? []).length && (
                  <tr>
                    <td colSpan={5} className="textMuted">Нет ликвидностной надбавки (haircut=0 по всем позициям).</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="cardTitle">Top contributors</div>
          <div className="cardSubtitle">Топ-вклад в риск по |ΔPnL| в базовой валюте.</div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table sticky">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Position</th>
                  <th>Scenario</th>
                  <th>ΔPnL ({baseCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {[...topVar, ...topEs, ...topStress].slice(0, 12).map((row, idx) => (
                  <tr key={`${row.metric}-${row.position_id}-${idx}`}>
                    <td>{row.metric}</td>
                    <td>{row.position_id}</td>
                    <td>{row.scenario_id ?? "—"}</td>
                    <td>{formatNumber(row.pnl_contribution, 2)}</td>
                  </tr>
                ))}
                {!topVar.length && !topEs.length && !topStress.length && (
                  <tr>
                    <td colSpan={4} className="textMuted">Нет данных по вкладам (проверьте, что есть сценарии и расчёт выполнен).</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Card>
  );
}

function KPI({ label, value, tooltip }: { label: string; value?: number; tooltip?: string }) {
  return (
    <Card>
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <div className="textMuted">
          {label} {tooltip && <HelpTooltip text={tooltip} />}
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 10 }} title={value !== undefined ? String(value) : undefined}>
        {value !== undefined ? formatNumber(value) : "—"}
      </div>
    </Card>
  );
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function buildPnlDistributionOption(args: {
  pnlDistribution: number[];
  varHist?: number | null;
  esHist?: number | null;
  baseCurrency: string;
}): EChartsOption | null {
  const { pnlDistribution, varHist, esHist, baseCurrency } = args;
  if (!pnlDistribution.length) return null;

  const sortedPnL = [...pnlDistribution].sort((a, b) => a - b);
  const accent = cssVar("--accent", "#0a84ff");
  const warning = cssVar("--warning", "#ff9500");
  const danger = cssVar("--danger", "#ff3b30");
  const muted = cssVar("--muted", "rgba(11, 18, 32, 0.62)");

  const markLineData: Array<Record<string, unknown>> = [];
  if (varHist !== undefined && varHist !== null) {
    markLineData.push({
      name: `VaR ${formatNumber(varHist, 2)} ${baseCurrency}`,
      yAxis: -varHist,
      lineStyle: { color: warning, type: "dashed", width: 2 },
    });
  }
  if (esHist !== undefined && esHist !== null) {
    markLineData.push({
      name: `ES ${formatNumber(esHist, 2)} ${baseCurrency}`,
      yAxis: -esHist,
      lineStyle: { color: danger, type: "dashed", width: 2 },
    });
  }

  return {
    animation: true,
    animationDuration: 850,
    animationDurationUpdate: 550,
    animationEasing: "cubicOut",
    grid: { top: 52, right: 18, bottom: 44, left: 58 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (params: any) => {
        const point = Array.isArray(params) ? params[0] : params;
        const value = Number(point?.value ?? 0);
        const rank = Number(point?.dataIndex ?? 0) + 1;
        return `Ранг: ${rank}<br/>PnL: <b>${formatNumber(value, 2)} ${baseCurrency}</b>`;
      },
    },
    xAxis: {
      type: "category",
      data: sortedPnL.map((_, idx) => String(idx + 1)),
      axisLabel: { show: false, color: muted },
      name: "Сценарии (хуже -> лучше)",
      nameLocation: "middle",
      nameGap: 26,
      nameTextStyle: { color: muted },
    },
    yAxis: {
      type: "value",
      name: `PnL, ${baseCurrency}`,
      nameTextStyle: { color: muted },
      axisLabel: {
        color: muted,
        formatter: (value: number) => formatNumber(value, 0),
      },
      splitLine: { lineStyle: { color: "rgba(120, 120, 120, 0.18)" } },
    },
    series: [
      {
        name: "PnL",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: sortedPnL,
        lineStyle: { color: accent, width: 3 },
        areaStyle: { color: accent, opacity: 0.16 },
        markLine: markLineData.length
          ? {
              symbol: "none",
              label: { color: muted, formatter: "{b}" },
              data: markLineData,
            }
          : undefined,
      },
    ],
  };
}

function buildStressOption(args: { rows: StressRow[]; baseCurrency: string }): EChartsOption | null {
  const { rows, baseCurrency } = args;
  if (!rows.length) return null;

  const success = cssVar("--success", "#34c759");
  const danger = cssVar("--danger", "#ff3b30");
  const warning = cssVar("--warning", "#ff9500");
  const muted = cssVar("--muted", "rgba(11, 18, 32, 0.62)");

  const data = rows.map((row) => ({
    value: row.pnl,
    scenario: row.scenario_id,
    limit: row.limit,
    breached: row.breached,
    itemStyle: {
      color: row.pnl < 0 ? danger : success,
      opacity: row.breached ? 1 : 0.88,
    },
  }));

  return {
    animation: true,
    animationDuration: 800,
    animationDurationUpdate: 450,
    grid: { top: 38, right: 18, bottom: 52, left: 58 },
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        const d = params.data as { value: number; scenario: string; limit?: number | null; breached: boolean };
        const limitText =
          d.limit === undefined || d.limit === null ? "—" : `${formatNumber(d.limit, 2)} ${baseCurrency}`;
        return [
          `<b>${d.scenario}</b>`,
          `PnL: <b>${formatNumber(d.value, 2)} ${baseCurrency}</b>`,
          `Лимит: ${limitText}`,
          `Статус: ${d.breached ? "Превышен" : "Ок"}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.scenario_id),
      axisLabel: { color: muted, rotate: 20 },
    },
    yAxis: {
      type: "value",
      name: `PnL, ${baseCurrency}`,
      nameTextStyle: { color: muted },
      axisLabel: {
        color: muted,
        formatter: (value: number) => formatNumber(value, 0),
      },
      splitLine: { lineStyle: { color: "rgba(120, 120, 120, 0.18)" } },
    },
    series: [
      {
        name: "Stress PnL",
        type: "bar",
        data,
        barWidth: "48%",
        itemStyle: { borderRadius: [8, 8, 0, 0] },
        markLine: {
          symbol: "none",
          lineStyle: { color: warning, type: "dotted" },
          data: [{ yAxis: 0, name: "Breakeven" }],
          label: { formatter: "0", color: muted },
        },
      },
    ],
  };
}

function buildLiquidityBreakdownOption(args: { rows: LcBreakdownRow[]; baseCurrency: string }): EChartsOption | null {
  const { rows, baseCurrency } = args;
  const filtered = rows.filter((row) => Math.abs(row.add_on_money) > 1e-12);
  if (!filtered.length) return null;

  const accent = cssVar("--accent", "#0a84ff");
  const muted = cssVar("--muted", "rgba(11, 18, 32, 0.62)");

  const sorted = [...filtered].sort((a, b) => Math.abs(b.add_on_money) - Math.abs(a.add_on_money)).slice(0, 14);
  const data = sorted.map((row) => ({
    value: row.add_on_money,
    qty: row.quantity,
    pv: row.position_value,
    haircut: row.haircut_input,
    model: row.model,
  }));

  return {
    animation: true,
    animationDuration: 700,
    animationDurationUpdate: 450,
    grid: { top: 18, right: 18, bottom: 42, left: 124 },
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        const idx = Number(params.dataIndex ?? 0);
        const row = sorted[idx];
        return [
          `<b>${row.position_id}</b>`,
          `Add-on: <b>${formatNumber(row.add_on_money, 2)} ${baseCurrency}</b>`,
          `Qty: ${formatNumber(row.quantity, 4)}`,
          `PV: ${formatNumber(row.position_value, 2)} ${baseCurrency}`,
          `Haircut input: ${formatNumber(row.haircut_input, 4)}`,
          `Model: ${row.model}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "value",
      name: `Add-on, ${baseCurrency}`,
      nameTextStyle: { color: muted },
      axisLabel: {
        color: muted,
        formatter: (value: number) => formatNumber(value, 0),
      },
      splitLine: { lineStyle: { color: "rgba(120, 120, 120, 0.18)" } },
    },
    yAxis: {
      type: "category",
      data: sorted.map((row) => row.position_id),
      axisLabel: { color: muted },
      inverse: true,
    },
    series: [
      {
        type: "bar",
        data,
        barWidth: "58%",
        itemStyle: { color: accent, borderRadius: [0, 8, 8, 0] },
      },
    ],
  };
}

function buildContributorsOption(args: { rows: ContributorRow[]; baseCurrency: string }): EChartsOption | null {
  const { rows, baseCurrency } = args;
  if (!rows.length) return null;

  const accent = cssVar("--accent", "#0a84ff");
  const warning = cssVar("--warning", "#ff9500");
  const danger = cssVar("--danger", "#ff3b30");
  const muted = cssVar("--muted", "rgba(11, 18, 32, 0.62)");

  const metricColor: Record<string, string> = {
    var_hist: accent,
    es_hist: warning,
    stress: danger,
  };

  const sorted = [...rows].sort((a, b) => b.abs_pnl_contribution - a.abs_pnl_contribution).slice(0, 14);
  const data = sorted.map((row) => ({
    value: row.pnl_contribution,
    abs: row.abs_pnl_contribution,
    metric: row.metric ?? "risk",
    scenario: row.scenario_id ?? "—",
    itemStyle: { color: metricColor[row.metric ?? ""] ?? accent },
  }));

  return {
    animation: true,
    animationDuration: 750,
    animationDurationUpdate: 450,
    grid: { top: 18, right: 18, bottom: 42, left: 178 },
    tooltip: {
      trigger: "item",
      formatter: (params: any) => {
        const idx = Number(params.dataIndex ?? 0);
        const row = sorted[idx];
        return [
          `<b>${row.position_id}</b>`,
          `Metric: ${row.metric ?? "risk"}`,
          `Scenario: ${row.scenario_id ?? "—"}`,
          `Contribution: <b>${formatNumber(row.pnl_contribution, 2)} ${baseCurrency}</b>`,
          `|Contribution|: ${formatNumber(row.abs_pnl_contribution, 2)} ${baseCurrency}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "value",
      name: `ΔPnL, ${baseCurrency}`,
      nameTextStyle: { color: muted },
      axisLabel: {
        color: muted,
        formatter: (value: number) => formatNumber(value, 0),
      },
      splitLine: { lineStyle: { color: "rgba(120, 120, 120, 0.18)" } },
    },
    yAxis: {
      type: "category",
      data: sorted.map((row) => `${row.position_id} (${row.metric ?? "risk"})`),
      axisLabel: { color: muted, width: 160, overflow: "truncate" },
      inverse: true,
    },
    series: [
      {
        type: "bar",
        data,
        barWidth: "60%",
        itemStyle: { borderRadius: [0, 8, 8, 0] },
      },
    ],
  };
}
