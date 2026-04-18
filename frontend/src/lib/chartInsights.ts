import { formatNumber } from "../utils/format";

export type InsightTone = "default" | "success" | "warning" | "danger";

export type ChartInsightItem = {
  label: string;
  text: string;
  tone?: InsightTone;
};

export type StressInsightRow = {
  scenario_id: string;
  pnl: number;
  limit?: number | null;
  breached: boolean;
};

export type ContributorInsightRow = {
  metric?: string;
  position_id: string;
  scenario_id?: string;
  pnl_contribution: number;
  abs_pnl_contribution: number;
};

export type CompositionSlice = {
  label: string;
  value: number;
  color?: string;
};

export type MetricCompositionRow = Record<string, string | number>;

export type MetricCompositionSeries = {
  key: string;
  label: string;
  color?: string;
};

export type RiskConnectionNode = {
  id: string;
  label: string;
  weight: number;
  tone?: string;
};

export type RiskConnectionLink = {
  from: string;
  to: string;
  weight: number;
};

const METRIC_LABELS: Record<string, string> = {
  stress: "Stress",
  var_hist: "Hist VaR",
  es_hist: "Hist ES",
  var_param: "Param VaR",
  es_param: "Param ES",
  lc_var: "LC VaR",
};

function formatPercent(value: number, digits = 1) {
  return `${formatNumber(value, digits)}%`;
}

function formatMetric(metric: string) {
  return METRIC_LABELS[metric] ?? metric.replaceAll("_", " ");
}

function classifyLimitZone(utilization: number) {
  if (utilization >= 100) return { tone: "danger" as const, label: "критическая зона" };
  if (utilization >= 75) return { tone: "warning" as const, label: "зона контроля" };
  return { tone: "success" as const, label: "рабочая зона" };
}

export function buildStressInsights(params: {
  stressRows: StressInsightRow[];
  scenarioCount?: number;
  baseCurrency: string;
}): ChartInsightItem[] {
  const totalScenarios = params.stressRows.length || Math.max(0, params.scenarioCount ?? 0);
  if (!totalScenarios) {
    return [];
  }
  if (!params.stressRows.length) {
    return [
      {
        label: "Сценарии",
        text: `В каталоге подготовлено ${totalScenarios} сценариев, но stress P&L ещё не рассчитан.`,
        tone: "warning",
      },
    ];
  }

  const worst = params.stressRows.reduce((acc, row) => (row.pnl < acc.pnl ? row : acc), params.stressRows[0]);
  const best = params.stressRows.reduce((acc, row) => (row.pnl > acc.pnl ? row : acc), params.stressRows[0]);
  const breachedCount = params.stressRows.filter((row) => row.breached).length;
  const range = best.pnl - worst.pnl;
  const asymmetryRatio = best.pnl > 0 ? Math.abs(worst.pnl) / best.pnl : Number.NaN;

  return [
    {
      label: "Хвост",
      text:
        worst.pnl < 0
          ? `Худший сценарий ${worst.scenario_id} даёт ${formatNumber(worst.pnl, 2)} ${params.baseCurrency}.`
          : `Отрицательного stress P&L в текущем наборе сценариев нет.`,
      tone: worst.pnl < 0 ? "danger" : "success",
    },
    {
      label: "Лимиты",
      text: breachedCount
        ? `Лимит нарушен в ${breachedCount} из ${params.stressRows.length} рассчитанных сценариев.`
        : `Превышений лимита нет в ${params.stressRows.length} рассчитанных сценариях.`,
      tone: breachedCount ? (breachedCount === params.stressRows.length ? "danger" : "warning") : "success",
    },
    {
      label: "Форма",
      text:
        params.stressRows.length < 2
          ? `Для оценки формы хвоста нужен как минимум ещё один сценарий.`
          : best.pnl <= 0
            ? `Все рассчитанные сценарии лежат в отрицательной зоне P&L.`
            : worst.pnl >= 0
              ? `Даже худший сценарий остаётся неотрицательным; диапазон P&L = ${formatNumber(range, 2)} ${params.baseCurrency}.`
              : Number.isFinite(asymmetryRatio) && asymmetryRatio >= 1.25
                ? `Негативный хвост глубже позитивного: худший сценарий по модулю в ${formatNumber(asymmetryRatio, 1)} раза сильнее лучшего.`
                : `Диапазон между лучшим и худшим сценарием составляет ${formatNumber(range, 2)} ${params.baseCurrency}.`,
      tone: worst.pnl < 0 ? "warning" : "success",
    },
  ];
}

export function buildLimitOverviewInsights(params: {
  limits: Array<[string, number, number, boolean]>;
  overallUtilization: number;
}): ChartInsightItem[] {
  if (!params.limits.length) {
    return [
      {
        label: "Лимиты",
        text: "Лимиты не были переданы в расчёт, поэтому сравнение с порогами недоступно.",
        tone: "warning",
      },
    ];
  }

  const ranked = params.limits
    .map(([metric, value, limit, breached]) => ({
      metric,
      value,
      limit,
      breached,
      utilization: limit ? Math.abs((value / limit) * 100) : 0,
    }))
    .sort((left, right) => right.utilization - left.utilization);

  const nearest = ranked[0];
  const breachedCount = ranked.filter((item) => item.breached).length;
  const zone = classifyLimitZone(params.overallUtilization);

  return [
    {
      label: "Зона",
      text: `Максимальная загрузка лимита составляет ${formatPercent(params.overallUtilization)}: ${zone.label}.`,
      tone: zone.tone,
    },
    {
      label: "Ближайший порог",
      text:
        nearest.utilization >= 100
          ? `${formatMetric(nearest.metric)} превышает лимит на ${formatPercent(nearest.utilization - 100)}.`
          : `${formatMetric(nearest.metric)} использует ${formatPercent(nearest.utilization)} лимита; запас ${formatPercent(100 - nearest.utilization)}.`,
      tone: nearest.utilization >= 100 ? "danger" : nearest.utilization >= 80 ? "warning" : "success",
    },
    {
      label: "Нарушения",
      text: breachedCount
        ? `Нарушено ${breachedCount} из ${ranked.length} лимитов.`
        : `Прямых breach-событий нет по ${ranked.length} лимитам.`,
      tone: breachedCount ? "danger" : "success",
    },
  ];
}

export function buildLimitComparisonInsights(params: {
  limits: Array<[string, number, number, boolean]>;
}): ChartInsightItem[] {
  if (!params.limits.length) {
    return [];
  }

  const ranked = params.limits
    .map(([metric, value, limit, breached]) => ({
      metric,
      breached,
      utilization: limit ? Math.abs((value / limit) * 100) : 0,
    }))
    .sort((left, right) => right.utilization - left.utilization);

  const highest = ranked[0];
  const lowest = ranked[ranked.length - 1];
  const nearLimitCount = ranked.filter((item) => item.utilization >= 80 && item.utilization < 100).length;
  const spread = highest.utilization - lowest.utilization;

  return [
    {
      label: "Лидер нагрузки",
      text: `${formatMetric(highest.metric)} остаётся самой напряжённой метрикой с загрузкой ${formatPercent(highest.utilization)}.`,
      tone: highest.breached ? "danger" : highest.utilization >= 80 ? "warning" : "success",
    },
    {
      label: "Жёлтая зона",
      text: nearLimitCount
        ? `В диапазоне 80–100% находятся ${nearLimitCount} метрик из ${ranked.length}.`
        : `Метрик в зоне 80–100% сейчас нет; основной запас находится ниже жёлтого порога.`,
      tone: nearLimitCount ? "warning" : "success",
    },
    {
      label: "Разброс",
      text: ranked.length > 1
        ? `Разница между самой загруженной и самой свободной метрикой составляет ${formatPercent(spread)}.`
        : `Для сравнения по разрезам нужен хотя бы ещё один лимитный показатель.`,
      tone: "default",
    },
  ];
}

export function buildContributorInsights(params: {
  contributors: ContributorInsightRow[];
}): ChartInsightItem[] {
  if (!params.contributors.length) {
    return [
      {
        label: "Вкладчики",
        text: "Позиционные вклады не были рассчитаны или не вошли в текущий ответ.",
        tone: "warning",
      },
    ];
  }

  const ranked = [...params.contributors].sort((left, right) => right.abs_pnl_contribution - left.abs_pnl_contribution);
  const total = ranked.reduce((sum, row) => sum + row.abs_pnl_contribution, 0) || 1;
  const leader = ranked[0];
  const topThreeShare = (ranked.slice(0, 3).reduce((sum, row) => sum + row.abs_pnl_contribution, 0) / total) * 100;
  const leaderShare = (leader.abs_pnl_contribution / total) * 100;
  const leaderMetric = leader.metric ? ` по метрике ${formatMetric(leader.metric)}` : "";

  return [
    {
      label: "Лидер",
      text: `${leader.position_id}${leaderMetric} формирует крупнейший показанный вклад: ${formatNumber(leader.pnl_contribution, 2)}.`,
      tone: leader.pnl_contribution < 0 ? "danger" : "success",
    },
    {
      label: "Концентрация",
      text:
        topThreeShare >= 75
          ? `Среди показанных строк топ-3 формируют ${formatPercent(topThreeShare)} вклада: риск заметно сконцентрирован.`
          : topThreeShare >= 55
            ? `Среди показанных строк топ-3 формируют ${formatPercent(topThreeShare)} вклада: концентрация умеренная.`
            : `Среди показанных строк топ-3 формируют ${formatPercent(topThreeShare)} вклада: вклад распределён без жёсткого перекоса.`,
      tone: topThreeShare >= 75 ? "warning" : "default",
    },
    {
      label: "Доминирование",
      text:
        leaderShare >= 50
          ? `Один вкладчик даёт ${formatPercent(leaderShare)} видимого вклада, поэтому распределение держится на узком наборе позиций.`
          : `Крупнейший вкладчик даёт ${formatPercent(leaderShare)} видимого вклада, без одиночного доминирования.`,
      tone: leaderShare >= 50 ? "warning" : "success",
    },
  ];
}

export function buildLiquidityInsights(params: {
  baseVar: number;
  lcVar?: number | null;
  capital?: number | null;
  initialMargin?: number | null;
  variationMargin?: number | null;
  baseCurrency: string;
}): ChartInsightItem[] {
  const baseVar = Math.max(0, params.baseVar || 0);
  const lcVar = Math.max(0, params.lcVar ?? 0);
  const capital = Math.max(0, params.capital ?? 0);
  const initialMargin = Math.max(0, params.initialMargin ?? 0);
  const variationMargin = params.variationMargin ?? 0;

  const addOnShare = baseVar > 0 ? ((lcVar - baseVar) / baseVar) * 100 : 0;
  const marginToCapital = capital > 0 ? (initialMargin / capital) * 100 : 0;

  return [
    {
      label: "Ликвидность",
      text:
        baseVar > 0
          ? addOnShare > 1
            ? `LC VaR выше базового VaR на ${formatPercent(addOnShare)}: ликвидностная надбавка заметно влияет на итоговый риск.`
            : `LC VaR почти совпадает с базовым VaR: влияние ликвидностной надбавки остаётся ограниченным (${formatPercent(addOnShare)}).`
          : `Базовый VaR не рассчитан, поэтому сравнение с LC VaR недоступно.`,
      tone: baseVar > 0 && addOnShare > 10 ? "warning" : "default",
    },
    {
      label: "Маржа",
      text:
        capital > 0
          ? `Начальная маржа составляет ${formatPercent(marginToCapital)} от рассчитанного капитала.`
          : initialMargin > 0
            ? `Начальная маржа рассчитана на уровне ${formatNumber(initialMargin, 2)} ${params.baseCurrency}, но капитал в ответе отсутствует.`
            : `Маржинальные требования не были рассчитаны.`,
      tone: capital > 0 && marginToCapital > 100 ? "warning" : "default",
    },
    {
      label: "Поток",
      text:
        variationMargin < 0
          ? `Вариационная маржа показывает отток ${formatNumber(Math.abs(variationMargin), 2)} ${params.baseCurrency}.`
          : variationMargin > 0
            ? `Вариационная маржа показывает приток ${formatNumber(variationMargin, 2)} ${params.baseCurrency}.`
            : `На текущем шаге вариационная маржа находится около нуля.`,
      tone: variationMargin < 0 ? "danger" : variationMargin > 0 ? "success" : "default",
    },
  ];
}

export function buildCompositionInsights(params: {
  slices: CompositionSlice[];
}): ChartInsightItem[] {
  if (!params.slices.length) {
    return [];
  }

  const total = params.slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const focusSlices = params.slices.filter((slice) => slice.label !== "Остальные");
  const ranked = (focusSlices.length ? focusSlices : params.slices).slice().sort((left, right) => right.value - left.value);
  const leader = ranked[0];
  const topThreeShare = (ranked.slice(0, 3).reduce((sum, slice) => sum + slice.value, 0) / total) * 100;
  const leaderShare = (leader.value / total) * 100;

  return [
    {
      label: "Крупнейший сегмент",
      text: `${leader.label} занимает ${formatPercent(leaderShare)} показанного объёма портфеля.`,
      tone: leaderShare >= 40 ? "warning" : "default",
    },
    {
      label: "Топ-3",
      text: `Три крупнейших сегмента формируют ${formatPercent(topThreeShare)} структуры.`,
      tone: topThreeShare >= 75 ? "warning" : "default",
    },
    {
      label: "Форма",
      text:
        topThreeShare >= 75
          ? `Структура выглядит концентрированной: основной объём собран в ограниченном числе сегментов.`
          : `Структура выглядит умеренно распределённой: заметная часть объёма уходит за пределы трёх крупнейших сегментов.`,
      tone: topThreeShare >= 75 ? "warning" : "success",
    },
  ];
}

export function buildMetricCompositionInsights(params: {
  rows: MetricCompositionRow[];
  series: MetricCompositionSeries[];
}): ChartInsightItem[] {
  if (!params.rows.length || !params.series.length) {
    return [];
  }

  const seriesLabelByKey = new Map(params.series.map((item) => [item.key, item.label]));
  const leaders = params.rows.map((row) => {
    const entries = Object.entries(row).filter(
      ([key, value]) => key !== "label" && typeof value === "number" && Number.isFinite(value)
    ) as Array<[string, number]>;
    const topEntry = entries.sort((left, right) => right[1] - left[1])[0];
    return {
      metricLabel: String(row.label ?? "Метрика"),
      key: topEntry?.[0] ?? "other",
      share: topEntry?.[1] ?? 0,
    };
  });

  const leaderCounts = new Map<string, number>();
  for (const leader of leaders) {
    leaderCounts.set(leader.key, (leaderCounts.get(leader.key) ?? 0) + 1);
  }

  const repeatedLeader = Array.from(leaderCounts.entries()).sort((left, right) => right[1] - left[1])[0];
  const strongestMetric = [...leaders].sort((left, right) => right.share - left.share)[0];
  const averageOther = params.rows.reduce((sum, row) => sum + Number(row.other ?? 0), 0) / params.rows.length;
  const strongestLabel = seriesLabelByKey.get(strongestMetric.key) ?? "Остальные";
  const repeatedLeaderLabel = seriesLabelByKey.get(repeatedLeader?.[0] ?? "") ?? "Остальные";

  return [
    {
      label: "Пиковая доля",
      text: `В метрике ${strongestMetric.metricLabel} крупнейшая доля приходится на ${strongestLabel}: ${formatPercent(strongestMetric.share)}.`,
      tone: strongestMetric.share >= 60 ? "warning" : "default",
    },
    {
      label: "Повторяемость",
      text:
        repeatedLeader && repeatedLeader[1] >= 2
          ? `${repeatedLeaderLabel} повторяется как лидер в ${repeatedLeader[1]} из ${params.rows.length} метрик.`
          : `Лидер меняется между метриками: единой доминирующей позиции в показанном наборе нет.`,
      tone: repeatedLeader && repeatedLeader[1] >= 3 ? "warning" : "default",
    },
    {
      label: "Хвост",
      text:
        averageOther > 25
          ? `За пределами фокусных позиций остаётся в среднем ${formatPercent(averageOther)} вклада по метрикам.`
          : `Основной вклад уже собран в фокусных позициях: хвост остальных в среднем ${formatPercent(averageOther)}.`,
      tone: averageOther > 25 ? "default" : "success",
    },
  ];
}

export function buildRiskConnectionInsights(params: {
  metrics: RiskConnectionNode[];
  positions: RiskConnectionNode[];
  links: RiskConnectionLink[];
}): ChartInsightItem[] {
  if (!params.metrics.length || !params.positions.length || !params.links.length) {
    return [];
  }

  const metricLabelById = new Map(params.metrics.map((item) => [item.id, item.label]));
  const positionLabelById = new Map(params.positions.map((item) => [item.id, item.label]));
  const strongestLink = [...params.links].sort((left, right) => right.weight - left.weight)[0];
  const totalPossibleLinks = params.metrics.length * params.positions.length;
  const coverage = totalPossibleLinks > 0 ? (params.links.length / totalPossibleLinks) * 100 : 0;
  const positionDegrees = new Map<string, number>();

  for (const link of params.links) {
    positionDegrees.set(link.to, (positionDegrees.get(link.to) ?? 0) + 1);
  }

  const mostConnected = Array.from(positionDegrees.entries()).sort((left, right) => right[1] - left[1])[0];
  const strongestMetricLabel = metricLabelById.get(strongestLink.from) ?? strongestLink.from;
  const strongestPositionLabel = positionLabelById.get(strongestLink.to) ?? strongestLink.to;
  const connectedPositionLabel = positionLabelById.get(mostConnected?.[0] ?? "") ?? "позиция";
  const connectedCount = mostConnected?.[1] ?? 0;

  return [
    {
      label: "Покрытие",
      text: `Построено ${params.links.length} связей между ${params.metrics.length} метриками и ${params.positions.length} позициями; покрыто ${formatPercent(coverage)} возможных пар.`,
      tone: "default",
    },
    {
      label: "Сильнейшая связь",
      text: `Самая сильная связь проходит между ${strongestMetricLabel} и ${strongestPositionLabel}.`,
      tone: "warning",
    },
    {
      label: "Узел",
      text:
        connectedCount >= 2
          ? `${connectedPositionLabel} влияет сразу на ${connectedCount} показанные метрики.`
          : `Каждая показанная позиция связана не более чем с одной метрикой.`,
      tone: connectedCount >= 3 ? "warning" : "default",
    },
  ];
}
