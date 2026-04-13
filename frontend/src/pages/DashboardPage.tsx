import { useEffect, useMemo } from "react";
import { Chip } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import AppTabs from "../components/AppTabs";
import AppTable from "../components/AppTable";
import Button from "../components/Button";
import Checklist from "../components/Checklist";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { PositionDTO } from "../api/types";
import { CorrelationMatrix, UtilizationPanel } from "../components/monolith/visuals";
import {
  MetricCompositionChart,
  PortfolioCompositionDonut,
  RiskConnectionMap,
} from "../components/rich/DashboardInsightCharts";
import {
  AreaTrendChart,
  CompareBarsChart,
  DonutGauge,
  GlassPanel,
  LineTrendChart,
  MetricHero,
  Reveal,
  Sparkline,
  StaggerGroup,
  StaggerItem,
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

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
  }, [metrics, dispatch]);

  const baseCurrency = String(
    metrics?.base_currency ?? wf.calcConfig.params?.baseCurrency ?? dataState.portfolio.positions[0]?.currency ?? "RUB"
  ).toUpperCase();

  const stressRows = useMemo<StressRow[]>(() => metrics?.stress ?? [], [metrics?.stress]);
  const topContributors = useMemo<ContributorRow[]>(() => {
    const raw = metrics?.top_contributors;
    if (!raw) return [];
    return Object.values(raw)
      .flat()
      .sort((a, b) => b.abs_pnl_contribution - a.abs_pnl_contribution)
      .slice(0, 6);
  }, [metrics?.top_contributors]);

  const contributorBars = useMemo(() => {
    const maxAbs = Math.max(...topContributors.map((row) => row.abs_pnl_contribution), 1);
    return topContributors.map((row) => ({
      label: row.metric ? `${row.metric} · ${row.position_id}` : row.position_id,
      value: (row.abs_pnl_contribution / maxAbs) * 100,
      tone: row.pnl_contribution < 0 ? "negative" as const : "positive" as const,
    }));
  }, [topContributors]);

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

  const distributionData = useMemo(
    () =>
      (metrics?.pnl_distribution?.length
        ? metrics.pnl_distribution
        : [0.18, 0.34, 0.28, 0.52, 0.4, 0.58, 0.46]
      ).map((value, index) => ({
        label: `${index + 1}`,
        value: Number(value),
      })),
    [metrics?.pnl_distribution]
  );

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
    const source = metrics?.limits?.length
      ? metrics.limits
      : ([["lc_var", metrics?.lc_var ?? 0, metrics?.base_value ?? 1, false]] as const);

    return source.map(([metric, value, limit, breached]) => ({
      label: String(metric),
      value: Math.min(100, limit ? Math.abs((value / limit) * 100) : 0),
      tone: breached ? "negative" as const : "positive" as const,
    }));
  }, [metrics?.base_value, metrics?.lc_var, metrics?.limits]);

  const liquidityBars = useMemo(() => {
    const base = Math.max(Math.abs(metrics?.base_value ?? 0), 1);
    return [
      { label: "Capital", value: Math.min(100, (Math.abs(metrics?.capital ?? 0) / base) * 100), tone: "positive" as const },
      { label: "Initial margin", value: Math.min(100, (Math.abs(metrics?.initial_margin ?? 0) / base) * 100), tone: "neutral" as const },
      { label: "Variation margin", value: Math.min(100, (Math.abs(metrics?.variation_margin ?? 0) / base) * 100), tone: "negative" as const },
    ];
  }, [metrics?.base_value, metrics?.capital, metrics?.initial_margin, metrics?.variation_margin]);

  const breachShare = stressRows.length ? (breachedCount / stressRows.length) * 100 : 0;
  const scenarioSpark = useMemo(
    () => stressTrendData.map((item, idx) => ({ label: `${idx + 1}`, value: Math.abs(item.value) })),
    [stressTrendData]
  );
  const correlationLabels = useMemo(
    () => dataState.portfolio.positions.map((position) => position.position_id),
    [dataState.portfolio.positions]
  );
  const confidenceLabel = metrics?.confidence_level ? `${Math.round(metrics.confidence_level * 100)}% confidence` : null;
  const horizonLabel = metrics?.horizon_days ? `${metrics.horizon_days} дн. горизонт` : null;
  const modeLabel = metrics?.mode ? `режим ${metrics.mode}` : null;
  const liquidityModelLabel = metrics?.liquidity_model ? `ликвидность ${metrics.liquidity_model}` : null;

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

  return (
    <div className="importPagePlain dashboardPage dashboardPage--revamp">
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Панель риска</h1>
          <div className="importHeroMeta">
            <Chip color={utilization >= 100 ? "danger" : utilization >= 75 ? "warning" : "success"} variant="soft" size="sm">
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
            <p className="dashboardSectionText">Сначала общий статус портфеля, затем три главные карточки с базовой стоимостью, риск-метриками и стрессом.</p>
          </div>
          <div className="dashboardSectionMeta">
            {confidenceLabel ? <span className="dashboardSectionTag">{confidenceLabel}</span> : null}
            {horizonLabel ? <span className="dashboardSectionTag">{horizonLabel}</span> : null}
            {modeLabel ? <span className="dashboardSectionTag">{modeLabel}</span> : null}
          </div>
        </div>
        <div className="dashboardSectionBody">
          <div className="dashboardPulseRow">
            <div className="dashboardPulseCard">
              <span>Позиции</span>
              <strong>{dataState.portfolio.positions.length}</strong>
            </div>
            <div className="dashboardPulseCard">
              <span>Сценарии</span>
              <strong>{stressRows.length || dataState.scenarios.length}</strong>
            </div>
            <div className="dashboardPulseCard">
              <span>Превышения</span>
              <strong>{breachedCount}</strong>
            </div>
            <div className="dashboardPulseCard">
              <span>Использование лимитов</span>
              <strong>{Math.round(utilization)}%</strong>
            </div>
          </div>

          <StaggerGroup className="dashboardHeroGrid">
            <StaggerItem>
              <MetricHero
                label="Стоимость портфеля"
                value={metrics.base_value ?? 0}
                hint={baseCurrency}
                chart={<Sparkline data={distributionData.slice(-10)} />}
              />
            </StaggerItem>
            <StaggerItem>
              <MetricHero
                label="VaR / ES"
                value={metrics.var_hist ?? metrics.var_param ?? 0}
                tone={utilization >= 100 ? "danger" : "success"}
                hint={`ES ${formatNumber(metrics.es_hist ?? metrics.es_param ?? 0, 2)}`}
                chart={
                  <div className="heroInlineStats">
                    <div className="heroInlineStat">
                      <span>VaR</span>
                      <strong>{formatNumber(metrics.var_hist ?? metrics.var_param ?? 0, 2)}</strong>
                    </div>
                    <div className="heroInlineStat">
                      <span>ES</span>
                      <strong>{formatNumber(metrics.es_hist ?? metrics.es_param ?? 0, 2)}</strong>
                    </div>
                    <div className="heroInlineStat">
                      <span>LC VaR</span>
                      <strong>{formatNumber(metrics.lc_var ?? 0, 2)}</strong>
                    </div>
                  </div>
                }
              />
            </StaggerItem>
            <StaggerItem>
              <MetricHero
                label="Худший стресс"
                value={worstStress ?? 0}
                tone={worstStress !== undefined && worstStress < 0 ? "danger" : "success"}
                hint={baseCurrency}
                chart={<Sparkline data={scenarioSpark} color={worstStress !== undefined && worstStress < 0 ? "#ff7777" : "#6eff8e"} />}
              />
            </StaggerItem>
          </StaggerGroup>
        </div>
      </section>

      <section className="dashboardSection">
        <div className="dashboardSectionHead">
          <div className="dashboardSectionIntro">
            <div className="dashboardSectionEyebrow">Мониторинг</div>
            <h2 className="dashboardSectionTitle">Текущий риск-контур</h2>
            <p className="dashboardSectionText">Основной контроль: stress P&amp;L, лимиты и доля сценариев, где уже есть нарушение.</p>
          </div>
          <div className="dashboardSectionMeta">
            <span className="dashboardSectionTag">{stressTrendData.length} сценариев</span>
            <span className="dashboardSectionTag">{breachedCount} превышений</span>
          </div>
        </div>
        <div className="dashboardSectionBody">
          <div className="dashboardFlowGrid">
            <Reveal>
              <GlassPanel
                title="Профиль stress P&L"
                subtitle="Возвращённый сравнительный график: основной P&L и лимит на одной оси."
                badge={<Chip color={worstStress !== undefined && worstStress < 0 ? "danger" : "success"} variant="flat" radius="sm">{stressTrendData.length} сцен.</Chip>}
              >
                <AreaTrendChart data={stressTrendData} color="#7da7ff" accent="#6eff8e" showSecondary />
                <LineTrendChart data={stressTrendData} color="#7da7ff" secondaryColor="#6eff8e" showSecondary primaryLabel="Stress P&L" secondaryLabel="Лимит" />
              </GlassPanel>
            </Reveal>
            <Reveal delay={0.05}>
              <GlassPanel
                title="Контроль лимитов и вклада"
                subtitle="Сверху — общая загрузка, ниже — вклад крупнейших драйверов риска."
              >
                <div className="dashboardGaugeRow">
                  <DonutGauge value={utilization} label="лимиты" subtitle="Текущий уровень использования лимитов." />
                  <DonutGauge value={breachShare} label="breach" subtitle="Доля stress-сценариев с превышением." color="#ff7777" />
                </div>
                <CompareBarsChart data={contributorBars} height={230} />
              </GlassPanel>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="dashboardSection">
        <div className="dashboardSectionHead">
          <div className="dashboardSectionIntro">
            <div className="dashboardSectionEyebrow">Структура</div>
            <h2 className="dashboardSectionTitle">Драйверы и связи риска</h2>
            <p className="dashboardSectionText">Блок показывает, где сосредоточен объём портфеля, какие позиции сильнее влияют на метрики и как они между собой связаны.</p>
          </div>
          <div className="dashboardSectionMeta">
            <span className="dashboardSectionTag">{portfolioComposition.length || 1} сегм.</span>
            <span className="dashboardSectionTag">{riskConnectionData.links.length} связей</span>
            {liquidityModelLabel ? <span className="dashboardSectionTag">{liquidityModelLabel}</span> : null}
          </div>
        </div>
        <div className="dashboardSectionBody">
          <StaggerGroup className="dashboardInsightGrid">
            <StaggerItem>
              <GlassPanel
                title="Структура портфеля"
                subtitle="Кольцевая диаграмма показывает, где сосредоточен основной объём позиций."
                badge={<Chip color="primary" variant="flat" radius="sm">{portfolioComposition.length || 1} сегм.</Chip>}
              >
                <PortfolioCompositionDonut data={portfolioComposition} unit={baseCurrency} />
              </GlassPanel>
            </StaggerItem>
            <StaggerItem>
              <GlassPanel
                title="Композиция риска по метрикам"
                subtitle="Стек по крупнейшим позициям: каждая колонка нормирована до 100% внутри метрики."
                badge={<Chip color="default" variant="flat" radius="sm">{contributorMetricComposition.rows.length || 0} метр.</Chip>}
              >
                <MetricCompositionChart
                  data={contributorMetricComposition.rows}
                  series={contributorMetricComposition.series}
                />
              </GlassPanel>
            </StaggerItem>
          </StaggerGroup>

          <Reveal>
            <GlassPanel
              title="Карта связей риска"
              subtitle="Радиальная схема связывает риск-метрики с позициями, которые формируют основной вклад."
              badge={<Chip color="secondary" variant="flat" radius="sm">{riskConnectionData.links.length} связей</Chip>}
            >
              <RiskConnectionMap
                metrics={riskConnectionData.metrics}
                positions={riskConnectionData.positions}
                links={riskConnectionData.links}
              />
            </GlassPanel>
          </Reveal>
        </div>
      </section>

      <section className="dashboardSection">
        <div className="dashboardSectionHead">
          <div className="dashboardSectionIntro">
            <div className="dashboardSectionEyebrow">Детали</div>
            <h2 className="dashboardSectionTitle">Таблицы и разрезы</h2>
            <p className="dashboardSectionText">Ниже уже детальная расшифровка: обзор, stress, лимиты и факторы без перегруза в верхней части страницы.</p>
          </div>
          <div className="dashboardSectionMeta">
            <span className="dashboardSectionTag">валюта {baseCurrency}</span>
            <span className="dashboardSectionTag">utilization {Math.round(utilization)}%</span>
          </div>
        </div>
        <div className="dashboardSectionBody">
          <AppTabs
            ariaLabel="Вкладки результатов риска"
            tabs={[
          {
            id: "overview",
            label: "Обзор",
            content: (
              <div className="visualSplitPanel">
                <GlassPanel title="Ключевые показатели" subtitle="Главные числа в одном месте, без лишнего шума.">
                  <AppTable
                    ariaLabel="Ключевые показатели риска"
                    headers={["Метрика", "Значение", "Комментарий"]}
                    rows={[
                      { key: "var", cells: ["VaR", formatNumber(metrics.var_hist ?? metrics.var_param ?? 0, 2), "Пороговый убыток"] },
                      { key: "es", cells: ["ES", formatNumber(metrics.es_hist ?? metrics.es_param ?? 0, 2), "Средний убыток хвоста"] },
                      { key: "lcvar", cells: ["LC VaR", formatNumber(metrics.lc_var ?? 0, 2), "С поправкой на ликвидность"] },
                      { key: "capital", cells: ["Capital", formatNumber(metrics.capital ?? 0, 2), "Требуемый капитал"] },
                      { key: "im", cells: ["Initial margin", formatNumber(metrics.initial_margin ?? 0, 2), "Начальная маржа"] },
                    ]}
                  />
                </GlassPanel>
                <GlassPanel title="Вкладчики риска" subtitle="Кто сейчас формирует риск портфеля.">
                  <CompareBarsChart data={contributorBars} height={260} />
                </GlassPanel>
              </div>
            ),
          },
          {
            id: "stress",
            label: "Стрессы",
            content: (
              <div className="visualSplitPanel">
                <GlassPanel title="Stress P&L по сценариям" subtitle="Подробный список сценариев и их статусов.">
                  <AppTable
                    ariaLabel="Стресс-сценарии"
                    headers={["Сценарий", "P&L", "Лимит", "Статус"]}
                    rows={stressRows.map((row) => ({
                      key: row.scenario_id,
                      cells: [
                        row.scenario_id,
                        formatNumber(row.pnl, 2),
                        row.limit ?? "—",
                        <Chip key={`${row.scenario_id}-status`} color={row.breached ? "danger" : "success"} variant="flat" radius="sm">
                          {row.breached ? "Превышен" : "Ок"}
                        </Chip>,
                      ],
                    }))}
                    emptyContent="Стресс-сценарии не рассчитывались."
                  />
                </GlassPanel>
                <GlassPanel title="Форма стресс-профиля" subtitle="Сравнение сценариев с лимитной границей.">
                  <AreaTrendChart data={stressTrendData} color="#ff7777" accent="#7da7ff" showSecondary />
                </GlassPanel>
              </div>
            ),
          },
          {
            id: "limits",
            label: "Лимиты",
            content: (
              <div className="visualSplitPanel">
                <GlassPanel title="Использование по метрикам" subtitle="Нормировано до 100% для быстрой оценки.">
                  <CompareBarsChart data={limitBars} height={260} />
                </GlassPanel>
                <GlassPanel title="Факт / лимит" subtitle="Точные значения и статусы по лимитам.">
                  <AppTable
                    ariaLabel="Лимиты по метрикам"
                    headers={["Метрика", "Факт", "Лимит", "Статус"]}
                    rows={(metrics.limits ?? []).map(([metric, value, limit, breached]) => ({
                      key: metric,
                      cells: [
                        metric,
                        formatNumber(value, 2),
                        formatNumber(limit, 2),
                        <Chip key={`${metric}-status`} color={breached ? "danger" : "success"} variant="flat" radius="sm">
                          {breached ? "Превышен" : "Ок"}
                        </Chip>,
                      ],
                    }))}
                    emptyContent="Лимиты не переданы в расчёт."
                  />
                </GlassPanel>
              </div>
            ),
          },
          {
            id: "factors",
            label: "Факторы",
            content: (
              <div className="visualSplitPanel">
                <GlassPanel title="Корреляции P&L между позициями" subtitle="Матрица строится по сценарным P&L и показывает, какие позиции двигаются вместе, а какие компенсируют друг друга.">
                  <CorrelationMatrix matrix={correlations} labels={correlationLabels} size={10} />
                </GlassPanel>
                <GlassPanel title="Капитал и маржа" subtitle="Показатели ликвидности и обеспечения относительно стоимости портфеля.">
                  <CompareBarsChart data={liquidityBars} height={220} />
                  <div className="heroInlineStats">
                    <div className="heroInlineStat">
                      <span>LC VaR</span>
                      <strong>{formatNumber(metrics.lc_var ?? 0, 2)}</strong>
                    </div>
                    <div className="heroInlineStat">
                      <span>Capital</span>
                      <strong>{formatNumber(metrics.capital ?? 0, 2)}</strong>
                    </div>
                    <div className="heroInlineStat">
                      <span>Initial margin</span>
                      <strong>{formatNumber(metrics.initial_margin ?? 0, 2)}</strong>
                    </div>
                  </div>
                </GlassPanel>
              </div>
            ),
          },
            ]}
          />

          <div className="dashboardUtilizationWrap">
            <UtilizationPanel
              utilization={utilization}
              inflow={metrics.capital && metrics.base_value ? (metrics.capital / metrics.base_value) * 100 : 0}
              outflow={metrics.variation_margin && metrics.base_value ? (-metrics.variation_margin / metrics.base_value) * 100 : 0}
              statusLabel={utilization >= 100 ? "критической зоны" : utilization >= 75 ? "зоны контроля" : "безопасной зоны"}
              caption="Относительная загрузка лимитов и ликвидности сейчас находится в"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
