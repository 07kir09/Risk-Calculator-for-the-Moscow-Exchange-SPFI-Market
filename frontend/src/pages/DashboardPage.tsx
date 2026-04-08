import { useEffect, useMemo } from "react";
import {
  Chip,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
} from "@heroui/react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { CorrelationMatrix, UtilizationPanel } from "../components/monolith/visuals";
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
    const max = Math.max(...topContributors.map((row) => row.abs_pnl_contribution), 1);
    return topContributors.map((row) => ({
      label: row.metric ? `${row.metric} · ${row.position_id}` : row.position_id,
      value: (row.abs_pnl_contribution / max) * 100,
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
      (stressRows.length ? stressRows : [{ scenario_id: "Base", pnl: 0, limit: 0, breached: false }]).map((row) => ({
        label: row.scenario_id,
        value: row.pnl,
        secondary: row.limit ?? 0,
      })),
    [stressRows]
  );

  const limitBars = useMemo(
    () => {
      const source = metrics?.limits?.length
        ? metrics.limits
        : ([["lc_var", metrics?.lc_var ?? 0, metrics?.base_value ?? 1, false]] as const);

      return source.map(([metric, value, limit, breached]) => ({
        label: String(metric),
        value: limit ? Math.abs((value / limit) * 100) : 0,
        tone: breached ? "negative" as const : "positive" as const,
      }));
    },
    [metrics?.base_value, metrics?.lc_var, metrics?.limits]
  );

  const liquidityBars = useMemo(
    () => [
      { label: "Capital", value: Math.abs(metrics?.capital ?? 0), tone: "positive" as const },
      { label: "Initial margin", value: Math.abs(metrics?.initial_margin ?? 0), tone: "neutral" as const },
      { label: "Variation margin", value: Math.abs(metrics?.variation_margin ?? 0), tone: "negative" as const },
    ],
    [metrics?.capital, metrics?.initial_margin, metrics?.variation_margin]
  );

  const breachShare = stressRows.length ? (stressRows.filter((row) => row.breached).length / stressRows.length) * 100 : 0;

  if (!metrics) {
    return (
      <Card>
        <div className="pageHeader">
          <div className="pageHeaderText">
            <h1 className="pageTitle">Панель риска</h1>
            <p className="pageHint">После запуска расчёта здесь появятся итоговые метрики, стрессы, лимиты и объяснение источников риска.</p>
          </div>
        </div>
        <Button onClick={() => navigate("/run")}>Перейти к запуску</Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Панель риска</h1>
          <p className="pageHint">Сначала итог, затем причина, затем детализация. Без лишних решений на одном экране.</p>
        </div>
        <div className="pageActions">
          <Chip color={utilization >= 100 ? "danger" : utilization >= 75 ? "warning" : "success"} variant="flat" radius="sm">
            {utilization >= 100 ? "Есть превышения" : utilization >= 75 ? "Нужен контроль" : "Риск в норме"}
          </Chip>
          <Button variant="secondary" onClick={() => navigate("/stress")}>
            Стресс-сценарии
          </Button>
          <Button variant="secondary" onClick={() => navigate("/limits")}>
            Лимиты
          </Button>
        </div>
      </div>

      <div className="dashboardLayout">
        <div className="dashboardMain">
          <StaggerGroup className="dashboardHeroGrid">
            <StaggerItem>
              <MetricHero
                label="Стоимость портфеля"
                value={metrics.base_value ?? 0}
                hint={baseCurrency}
                chart={<Sparkline data={distributionData.slice(-8)} />}
              />
            </StaggerItem>
            <StaggerItem>
              <MetricHero
                label="VaR / ES"
                value={metrics.var_hist ?? metrics.var_param ?? 0}
                suffix=""
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
                chart={<Sparkline data={stressTrendData.slice(0, 8)} color={worstStress !== undefined && worstStress < 0 ? "#ff7777" : "#6eff8e"} />}
              />
            </StaggerItem>
          </StaggerGroup>

          <Tabs
            aria-label="Результаты расчёта"
            radius="sm"
            color="primary"
            classNames={{
              tabList: "importTabsList",
              tab: "importTab",
              cursor: "importTabCursor",
              panel: "importTabPanel",
            }}
          >
            <Tab key="overview" title="Обзор">
              <div className="visualBentoGrid">
                <Reveal>
                  <GlassPanel
                    title="Распределение PnL"
                    subtitle="Area-кривая показывает форму хвоста, а линия лимита даёт быстрый ориентир."
                    badge={<Chip color="primary" variant="flat" radius="sm">animated</Chip>}
                  >
                    <AreaTrendChart data={distributionData} color="#6eff8e" accent="#7da7ff" showSecondary={false} />
                  </GlassPanel>
                </Reveal>
                <div className="visualBentoStack">
                  <Reveal delay={0.05}>
                    <GlassPanel
                      title="Загрузка лимитов"
                      subtitle="Доля использованного лимита по самым важным метрикам."
                      badge={<Chip color={utilization >= 100 ? "danger" : "success"} variant="flat" radius="sm">{Math.round(utilization)}%</Chip>}
                    >
                      <DonutGauge value={utilization} label="utilization" subtitle="Отношение текущего факта к заданным лимитам." />
                    </GlassPanel>
                  </Reveal>
                  <Reveal delay={0.08}>
                    <GlassPanel title="Вкладчики риска" subtitle="Сразу видно, какой драйвер формирует основную часть хвоста риска.">
                      <CompareBarsChart data={contributorBars} height={220} />
                    </GlassPanel>
                  </Reveal>
                  <Reveal delay={0.1}>
                    <GlassPanel title="Тренд нагрузки" subtitle="Линейный график показывает, как факторы и стрессовая просадка движутся относительно друг друга.">
                      <LineTrendChart data={stressTrendData} color="#7da7ff" secondaryColor="#6eff8e" showSecondary />
                    </GlassPanel>
                  </Reveal>
                </div>
              </div>
            </Tab>

            <Tab key="stress" title="Стрессы">
              <div className="visualSplitPanel">
                <GlassPanel
                  title="Stress P&L по сценариям"
                  subtitle="Кривая даёт общую картину, а таблица остаётся рабочим слоем для точных значений."
                >
                  <AreaTrendChart data={stressTrendData} color="#ff7777" accent="#7da7ff" showSecondary />
                  <Table
                    removeWrapper
                    aria-label="Стресс-сценарии"
                    classNames={{ table: "heroTable", th: "heroTableHeader", td: "heroTableCell", tr: "heroTableRow" }}
                  >
                    <TableHeader>
                      <TableColumn>Сценарий</TableColumn>
                      <TableColumn>P&L</TableColumn>
                      <TableColumn>Лимит</TableColumn>
                      <TableColumn>Статус</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="Стресс-сценарии не рассчитывались.">
                      {stressRows.map((row) => (
                        <TableRow key={row.scenario_id}>
                          <TableCell>{row.scenario_id}</TableCell>
                          <TableCell>{formatNumber(row.pnl, 2)}</TableCell>
                          <TableCell>{row.limit ?? "—"}</TableCell>
                          <TableCell>
                            <Chip color={row.breached ? "danger" : "success"} variant="flat" radius="sm">
                              {row.breached ? "Превышен" : "Ок"}
                            </Chip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </GlassPanel>
                <div className="visualBentoStack">
                  <GlassPanel title="Доля breach" subtitle="Сколько сценариев уже пересекают лимит.">
                    <DonutGauge value={breachShare} label="breach share" subtitle="Процент стрессов с нарушением лимита." color="#ff7777" />
                  </GlassPanel>
                  <GlassPanel title="Хвостовые вкладчики" subtitle="Какие позиции сильнее всего ухудшают худший сценарий.">
                    <CompareBarsChart data={contributorBars} height={240} />
                  </GlassPanel>
                </div>
              </div>
            </Tab>

            <Tab key="limits" title="Лимиты">
              <div className="visualSplitPanel">
                <GlassPanel title="Использование лимитов" subtitle="Бар-чарт показывает, какие метрики ближе всего к красной зоне.">
                  <CompareBarsChart data={limitBars} height={280} />
                </GlassPanel>
                <GlassPanel title="Fact vs limit" subtitle="Табличный слой для точного сравнения факта и порога.">
                  <Table
                    removeWrapper
                    aria-label="Лимиты"
                    classNames={{ table: "heroTable", th: "heroTableHeader", td: "heroTableCell", tr: "heroTableRow" }}
                  >
                    <TableHeader>
                      <TableColumn>Метрика</TableColumn>
                      <TableColumn>Факт</TableColumn>
                      <TableColumn>Лимит</TableColumn>
                      <TableColumn>Статус</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="Лимиты не переданы в расчёт.">
                      {(metrics.limits ?? []).map(([metric, value, limit, breached]) => (
                        <TableRow key={metric}>
                          <TableCell>{metric}</TableCell>
                          <TableCell>{formatNumber(value, 2)}</TableCell>
                          <TableCell>{formatNumber(limit, 2)}</TableCell>
                          <TableCell>
                            <Chip color={breached ? "danger" : "success"} variant="flat" radius="sm">
                              {breached ? "Превышен" : "Ок"}
                            </Chip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </GlassPanel>
              </div>
            </Tab>

            <Tab key="correlations" title="Корреляции">
              <div className="dashboardPanelGrid">
                <GlassPanel title="Cross-correlation matrix" subtitle="Тепловая карта показывает, где факторы усиливают друг друга, а где дают естественный оффсет.">
                  <CorrelationMatrix matrix={correlations} />
                </GlassPanel>
                <GlassPanel title="Ликвидность и капитал" subtitle="Сводка по LC VaR, capital и марже в одном split-screen блоке.">
                  <CompareBarsChart data={liquidityBars} height={240} />
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
            </Tab>
          </Tabs>
        </div>

        <UtilizationPanel
          utilization={utilization}
          inflow={metrics.capital && metrics.base_value ? (metrics.capital / metrics.base_value) * 100 : 12.4}
          outflow={metrics.variation_margin && metrics.base_value ? (-metrics.variation_margin / metrics.base_value) * 100 : -4.2}
          statusLabel={utilization >= 100 ? "критической зоны" : utilization >= 75 ? "зоны контроля" : "безопасной зоны"}
          caption="Относительная загрузка лимитов и ликвидности сейчас находится в"
        />
      </div>
    </Card>
  );
}
