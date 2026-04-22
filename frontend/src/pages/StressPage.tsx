import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@heroui/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { Reveal } from "../components/rich/RichVisuals";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { runRiskCalculation } from "../api/services/risk";
import { PositionDTO } from "../api/types";
import { ScenarioDTO } from "../api/contracts/metrics";

type MacroFactor = "fx_rub" | "rates_rub" | "eq_moex" | "credit_spread" | "vol_surface" | "oil_brent";

type ScenarioDescriptor = {
  id: string;
  name: string;
  short: string;
  category: string;
  icon: string;
  description: string;
  tags: string[];
  shocks: Partial<Record<MacroFactor, number>>;
  model: {
    underlying_shift: number;
    volatility_shift: number;
    rate_shift: number;
  };
  source: "macro" | "configured" | "computed";
};

type DetailedStressRow = {
  scenario_id: string;
  pnl: number;
  limit?: number | null;
  breached: boolean;
  descriptor: ScenarioDescriptor;
};

type DecompositionRow = {
  key: string;
  label: string;
  fullLabel: string;
  value: number;
  tone: "positive" | "negative" | "neutral";
  mode: "actual" | "pressure";
  meta: string;
};

type ChartCardId = "stress_pnl" | "cumulative" | "breach" | "factors" | "decomposition" | "mix";

const CHART_CARD_META: Array<{ id: ChartCardId; label: string }> = [
  { id: "stress_pnl", label: "Stress P&L" },
  { id: "cumulative", label: "Кумулятивный" },
  { id: "breach", label: "Breach share" },
  { id: "factors", label: "Факторный профиль" },
  { id: "decomposition", label: "Позиции" },
  { id: "mix", label: "Структура" },
];

const FACTOR_LABELS: Record<MacroFactor, string> = {
  fx_rub: "FX / RUB",
  rates_rub: "Ставки RUB",
  eq_moex: "Акции / MOEX",
  credit_spread: "Кредитные спреды",
  vol_surface: "Волатильность",
  oil_brent: "Нефть",
};

const FACTOR_TONES: Record<MacroFactor, "positive" | "negative" | "neutral"> = {
  fx_rub: "neutral",
  rates_rub: "neutral",
  eq_moex: "negative",
  credit_spread: "negative",
  vol_surface: "negative",
  oil_brent: "neutral",
};

const CATEGORY_COLORS: Record<string, string> = {
  FX: "#7da7ff",
  Rates: "#ffb86a",
  Commodity: "#6eff8e",
  Equity: "#ff8f8f",
  Credit: "#b691ff",
  Vol: "#ff79c6",
  Geopolitical: "#ff9b5e",
  Macro: "#56d1e6",
  Scenario: "#82e6ff",
};

const MACRO_SCENARIOS: ScenarioDescriptor[] = [
  {
    id: "rub_deval_20",
    name: "Девальвация RUB -20%",
    short: "RUB -20%",
    category: "FX",
    icon: "💱",
    description: "Резкое ослабление рубля к корзине валют на 20%.",
    tags: ["валюта", "геополитика"],
    shocks: { fx_rub: -0.2, rates_rub: 0.03, eq_moex: -0.15 },
    model: { underlying_shift: -0.18, volatility_shift: 0.2, rate_shift: 0.03 },
    source: "macro",
  },
  {
    id: "cbr_hike_300",
    name: "ЦБ повышает ставку +300 б.п.",
    short: "КС +300",
    category: "Rates",
    icon: "🏦",
    description: "Экстренное ужесточение ДКП, рост доходностей и давления на риск-активы.",
    tags: ["ставка", "облигации"],
    shocks: { rates_rub: 0.03, eq_moex: -0.08, credit_spread: 0.015 },
    model: { underlying_shift: -0.08, volatility_shift: 0.12, rate_shift: 0.03 },
    source: "macro",
  },
  {
    id: "cbr_cut_200",
    name: "ЦБ снижает ставку -200 б.п.",
    short: "КС -200",
    category: "Rates",
    icon: "📉",
    description: "Смягчение ДКП, поддержка для облигаций и части риск-активов.",
    tags: ["ставка", "смягчение"],
    shocks: { rates_rub: -0.02, eq_moex: 0.05, credit_spread: -0.005 },
    model: { underlying_shift: 0.04, volatility_shift: -0.06, rate_shift: -0.02 },
    source: "macro",
  },
  {
    id: "oil_crash_35",
    name: "Нефть Brent -35%",
    short: "Brent -35%",
    category: "Commodity",
    icon: "🛢️",
    description: "Сырьевой шок с давлением на RUB, энергетический сектор и бюджетные ожидания.",
    tags: ["нефть", "сырье"],
    shocks: { oil_brent: -0.35, fx_rub: -0.12, eq_moex: -0.18 },
    model: { underlying_shift: -0.22, volatility_shift: 0.18, rate_shift: 0.01 },
    source: "macro",
  },
  {
    id: "moex_selloff_25",
    name: "Распродажа MOEX -25%",
    short: "MOEX -25%",
    category: "Equity",
    icon: "📊",
    description: "Широкая просадка рынка акций и рост risk-off поведения.",
    tags: ["акции", "волатильность"],
    shocks: { eq_moex: -0.25, credit_spread: 0.02, vol_surface: 0.4 },
    model: { underlying_shift: -0.25, volatility_shift: 0.4, rate_shift: 0.005 },
    source: "macro",
  },
  {
    id: "credit_spread_250",
    name: "Кредитные спреды +250 б.п.",
    short: "Спреды +250",
    category: "Credit",
    icon: "💳",
    description: "Расширение кредитных спредов и переоценка риска эмитентов.",
    tags: ["кредит", "дефолт"],
    shocks: { credit_spread: 0.025, eq_moex: -0.1, rates_rub: 0.005 },
    model: { underlying_shift: -0.1, volatility_shift: 0.15, rate_shift: 0.015 },
    source: "macro",
  },
  {
    id: "vol_spike_x2",
    name: "Рост волатильности x2",
    short: "Vol x2",
    category: "Vol",
    icon: "🌪️",
    description: "Резкий рост implied vol, особенно критичный для опционных позиций.",
    tags: ["опционы", "волатильность"],
    shocks: { vol_surface: 1.0, eq_moex: -0.12, fx_rub: -0.05 },
    model: { underlying_shift: -0.08, volatility_shift: 1.0, rate_shift: 0.0 },
    source: "macro",
  },
  {
    id: "sanctions_new",
    name: "Новый пакет санкций",
    short: "Санкции",
    category: "Geopolitical",
    icon: "🚫",
    description: "Комплексный геополитический шок по валюте, акциям и стоимости фондирования.",
    tags: ["геополитика", "санкции"],
    shocks: { fx_rub: -0.15, eq_moex: -0.2, credit_spread: 0.03, rates_rub: 0.02 },
    model: { underlying_shift: -0.2, volatility_shift: 0.45, rate_shift: 0.02 },
    source: "macro",
  },
  {
    id: "global_recession",
    name: "Глобальная рецессия",
    short: "Рецессия",
    category: "Macro",
    icon: "🌍",
    description: "Замедление мировой экономики с падением спроса на риск и сырье.",
    tags: ["макро", "рецессия"],
    shocks: { oil_brent: -0.2, eq_moex: -0.15, fx_rub: -0.08, rates_rub: -0.01 },
    model: { underlying_shift: -0.15, volatility_shift: 0.25, rate_shift: -0.01 },
    source: "macro",
  },
  {
    id: "inflation_surge_5",
    name: "Инфляционный шок +5%",
    short: "Инфляция +5%",
    category: "Macro",
    icon: "🔥",
    description: "Ускорение инфляции и последующее ужесточение денежно-кредитных условий.",
    tags: ["инфляция", "ставка"],
    shocks: { rates_rub: 0.04, eq_moex: -0.1, credit_spread: 0.01, fx_rub: -0.06 },
    model: { underlying_shift: -0.1, volatility_shift: 0.18, rate_shift: 0.04 },
    source: "macro",
  },
];

function normalizeSymbol(value: string | undefined | null): string {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "");
}

function looksLikeFxPair(symbol: string): boolean {
  return /[A-Z]{3}\/?[A-Z]{3}/.test(symbol);
}

function positionRiskMass(position: PositionDTO): number {
  const notional = Number.isFinite(position.notional) ? Math.abs(position.notional) : 0;
  const qty = Number.isFinite(position.quantity) ? Math.abs(position.quantity) : 1;
  return notional * Math.max(qty, 1);
}

function normalizeWeights(weights: Record<MacroFactor, number>): Record<MacroFactor, number> {
  const sum = (Object.values(weights) as number[]).reduce((acc, value) => acc + Math.max(value, 0), 0);
  if (sum <= 0) return { ...weights, eq_moex: 1 };
  return Object.fromEntries(
    (Object.entries(weights) as [MacroFactor, number][])
      .map(([factor, value]) => [factor, Math.max(value, 0) / sum])
  ) as Record<MacroFactor, number>;
}

function inferPositionFactorWeights(position: PositionDTO, baseCurrency: string): Record<MacroFactor, number> {
  const symbol = normalizeSymbol(position.underlying_symbol);
  const currency = String(position.currency ?? "").toUpperCase();
  const weights: Record<MacroFactor, number> = {
    fx_rub: 0,
    rates_rub: 0,
    eq_moex: 0,
    credit_spread: 0,
    vol_surface: 0,
    oil_brent: 0,
  };

  if (position.instrument_type === "option") {
    weights.eq_moex += 0.35;
    weights.vol_surface += 0.4;
    weights.rates_rub += 0.15;
    weights.fx_rub += 0.1;
  } else if (position.instrument_type === "forward") {
    weights.eq_moex += 0.5;
    weights.fx_rub += 0.35;
    weights.rates_rub += 0.15;
  } else {
    weights.rates_rub += 0.75;
    weights.credit_spread += 0.2;
    weights.fx_rub += 0.05;
  }

  if (looksLikeFxPair(symbol)) weights.fx_rub += 0.35;
  if (currency && currency !== baseCurrency) weights.fx_rub += 0.15;

  if (/(BRENT|WTI|OIL|URALS|GAZ|NG)/.test(symbol)) {
    weights.oil_brent += 0.65;
    weights.eq_moex += 0.15;
  }

  if (/(MOEX|IMOEX|RTS|SBER|GAZP|LKOH|ROSN|GMKN|NVTK|TATN|MGNT|YNDX|VTBR)/.test(symbol)) {
    weights.eq_moex += 0.4;
  }

  if (position.instrument_type === "option") weights.vol_surface += 0.15;
  if (position.instrument_type === "swap_ir") weights.rates_rub += 0.1;

  return normalizeWeights(weights);
}

function buildFactorExposure(positions: PositionDTO[], baseCurrency: string): Record<MacroFactor, number> {
  const exposure: Record<MacroFactor, number> = {
    fx_rub: 0,
    rates_rub: 0,
    eq_moex: 0,
    credit_spread: 0,
    vol_surface: 0,
    oil_brent: 0,
  };

  for (const position of positions) {
    const mass = positionRiskMass(position);
    if (mass <= 0) continue;
    const weights = inferPositionFactorWeights(position, baseCurrency);
    for (const [factor, weight] of Object.entries(weights) as [MacroFactor, number][]) {
      exposure[factor] += mass * weight;
    }
  }

  return exposure;
}

function macroScenarioToDTO(scenario: ScenarioDescriptor): ScenarioDTO {
  return {
    scenario_id: scenario.id,
    underlying_shift: scenario.model.underlying_shift,
    volatility_shift: scenario.model.volatility_shift,
    rate_shift: scenario.model.rate_shift,
    description: scenario.name,
  };
}

function buildGenericScenarioDescriptor(dto: ScenarioDTO): ScenarioDescriptor {
  const syntheticDescription = dto.description?.trim()
    || `ΔS ${formatSignedPercent(dto.underlying_shift)} · ΔVol ${formatSignedPercent(dto.volatility_shift)} · Δr ${formatSignedPercent(dto.rate_shift)}`;

  return {
    id: dto.scenario_id,
    name: dto.description?.trim() || dto.scenario_id.replaceAll("_", " "),
    short: shortenLabel(dto.scenario_id, 18),
    category: "Scenario",
    icon: "◌",
    description: syntheticDescription,
    tags: ["настроен"],
    shocks: {
      ...(dto.underlying_shift ? { eq_moex: dto.underlying_shift } : {}),
      ...(dto.volatility_shift ? { vol_surface: dto.volatility_shift } : {}),
      ...(dto.rate_shift ? { rates_rub: dto.rate_shift } : {}),
    },
    model: {
      underlying_shift: dto.underlying_shift,
      volatility_shift: dto.volatility_shift,
      rate_shift: dto.rate_shift,
    },
    source: "configured",
  };
}

function buildFallbackDescriptor(id: string): ScenarioDescriptor {
  return {
    id,
    name: id.replaceAll("_", " "),
    short: shortenLabel(id, 18),
    category: "Scenario",
    icon: "◌",
    description: "Сценарий рассчитан ранее и не найден в текущем каталоге макро-шоков.",
    tags: ["архив"],
    shocks: {},
    model: {
      underlying_shift: 0,
      volatility_shift: 0,
      rate_shift: 0,
    },
    source: "computed",
  };
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function formatComputedAt(iso?: string): string {
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

function formatCompactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(0)}`;
}

function shortenLabel(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

function formatPositionLabel(position: PositionDTO | undefined, fallbackId: string): string {
  const symbol = position?.underlying_symbol?.trim();
  if (symbol && symbol !== fallbackId) return `${fallbackId} · ${symbol}`;
  return fallbackId;
}

function ScenarioChartTooltip({
  active,
  payload,
  label,
  suffix = "RUB",
}: {
  active?: boolean;
  payload?: Array<{ color?: string; fill?: string; name?: string; value?: number }>;
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="stressTooltip">
      <div className="stressTooltipLabel">{label}</div>
      {payload.map((item, index) => (
        <div key={`${label}-${index}`} className="stressTooltipRow">
          <span
            className="stressTooltipDot"
            style={{ background: item.color ?? item.fill ?? "rgba(255,255,255,0.4)" }}
          />
          <span>{item.name ?? "Значение"}</span>
          <strong>{formatNumber(Number(item.value ?? 0), 2)} {suffix}</strong>
        </div>
      ))}
    </div>
  );
}

function FactorProfileTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    name?: string;
    value?: number;
    payload?: {
      shock?: number;
      exposure?: number;
      pressure?: number;
    };
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;

  return (
    <div className="stressTooltip">
      <div className="stressTooltipLabel">{label}</div>
      {payload.map((item, index) => (
        <div key={`${label}-${item.name ?? index}`} className="stressTooltipRow">
          <span
            className="stressTooltipDot"
            style={{ background: item.color ?? "rgba(255,255,255,0.4)" }}
          />
          <span>{item.name ?? "Профиль"}</span>
          <strong>{formatNumber(Number(item.value ?? 0), 1)}%</strong>
        </div>
      ))}
      {point?.shock ? (
        <div className="stressTooltipRow">
          <span className="stressTooltipDot" style={{ background: "rgba(255,255,255,0.22)" }} />
          <span>Шок сценария</span>
          <strong>{formatSignedPercent(point.shock)}</strong>
        </div>
      ) : null}
    </div>
  );
}

export default function StressPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();

  const metrics = dataState.results.metrics;
  const stressRows = metrics?.stress ?? [];
  const topStressContributors = metrics?.top_contributors?.stress ?? [];

  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"default" | "success" | "danger" | "warning">("default");
  const [isRecalc, setIsRecalc] = useState(false);
  const [showCatalog, setShowCatalog] = useState(true);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [activeChartId, setActiveChartId] = useState<ChartCardId>("stress_pnl");
  const chartRailRef = useRef<HTMLDivElement | null>(null);
  const chartCardRefs = useRef<Partial<Record<ChartCardId, HTMLDivElement | null>>>({});

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Stress });
  }, [dispatch, metrics]);

  const alpha = Number(wf.calcConfig.params?.alpha ?? 0.99);
  const horizonDays = Number(wf.calcConfig.params?.horizonDays ?? 10);
  const parametricTailModel = String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher");
  const baseCurrency = String(wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase();
  const fxRates = (wf.calcConfig.params?.fxRates as Record<string, number> | undefined) ?? undefined;
  const liquidityModel = String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value");
  const configSelectedMetrics = Array.isArray(wf.calcConfig.selectedMetrics) ? wf.calcConfig.selectedMetrics : [];
  const selectedMetricsForRun = useMemo(
    () => Array.from(new Set([...configSelectedMetrics, "stress"])),
    [configSelectedMetrics]
  );

  const factorExposure = useMemo(
    () => buildFactorExposure(dataState.portfolio.positions, baseCurrency),
    [baseCurrency, dataState.portfolio.positions]
  );

  const rankedCatalog = useMemo(() => {
    return MACRO_SCENARIOS
      .map((scenario) => {
        const relevance = (Object.entries(scenario.shocks) as [MacroFactor, number][])
          .reduce((acc, [factor, shock]) => acc + factorExposure[factor] * Math.abs(shock), 0);
        return { ...scenario, relevance };
      })
      .sort((left, right) => right.relevance - left.relevance);
  }, [factorExposure]);

  useEffect(() => {
    const topFive = new Set(rankedCatalog.slice(0, 5).map((scenario) => scenario.id));
    setSelectedScenarioIds(topFive);
  }, [dataState.portfolio.importedAt, rankedCatalog]);

  const selectedCatalog = useMemo(
    () => rankedCatalog.filter((scenario) => selectedScenarioIds.has(scenario.id)),
    [rankedCatalog, selectedScenarioIds]
  );

  const selectedScenarioDTOs = useMemo(
    () => selectedCatalog.map(macroScenarioToDTO),
    [selectedCatalog]
  );

  useEffect(() => {
    dataDispatch({ type: "SET_SCENARIOS", scenarios: selectedScenarioDTOs });
  }, [dataDispatch, selectedScenarioDTOs]);

  const scenarioLookup = useMemo(() => {
    const lookup = new Map<string, ScenarioDescriptor>();

    for (const scenario of MACRO_SCENARIOS) {
      lookup.set(scenario.id, scenario);
    }

    for (const scenario of dataState.scenarios) {
      if (!lookup.has(scenario.scenario_id)) {
        lookup.set(scenario.scenario_id, buildGenericScenarioDescriptor(scenario));
      }
    }

    for (const row of stressRows) {
      if (!lookup.has(row.scenario_id)) {
        lookup.set(row.scenario_id, buildFallbackDescriptor(row.scenario_id));
      }
    }

    return lookup;
  }, [dataState.scenarios, stressRows]);

  const stressRowsDetailed = useMemo<DetailedStressRow[]>(() => {
    return [...stressRows]
      .map((row) => ({
        ...row,
        descriptor: scenarioLookup.get(row.scenario_id) ?? buildFallbackDescriptor(row.scenario_id),
      }))
      .sort((left, right) => left.pnl - right.pnl);
  }, [scenarioLookup, stressRows]);

  useEffect(() => {
    const knownIds = new Set([
      ...Array.from(scenarioLookup.keys()),
      ...stressRowsDetailed.map((row) => row.scenario_id),
      ...selectedCatalog.map((row) => row.id),
    ]);

    if (activeScenarioId && knownIds.has(activeScenarioId)) return;

    const fallback = stressRowsDetailed[0]?.scenario_id ?? selectedCatalog[0]?.id ?? rankedCatalog[0]?.id ?? null;
    if (fallback) setActiveScenarioId(fallback);
  }, [activeScenarioId, rankedCatalog, scenarioLookup, selectedCatalog, stressRowsDetailed]);

  const activeStressRow = useMemo(
    () => (activeScenarioId ? stressRowsDetailed.find((row) => row.scenario_id === activeScenarioId) : undefined),
    [activeScenarioId, stressRowsDetailed]
  );

  const activeScenarioMeta = useMemo(() => {
    if (activeScenarioId) {
      return scenarioLookup.get(activeScenarioId) ?? activeStressRow?.descriptor ?? null;
    }
    return stressRowsDetailed[0]?.descriptor ?? selectedCatalog[0] ?? rankedCatalog[0] ?? null;
  }, [activeScenarioId, activeStressRow?.descriptor, rankedCatalog, scenarioLookup, selectedCatalog, stressRowsDetailed]);

  const positionsById = useMemo(
    () => new Map(dataState.portfolio.positions.map((position) => [position.position_id, position])),
    [dataState.portfolio.positions]
  );

  const actualContributorRows = useMemo(() => {
    const targetId = activeScenarioId ?? activeScenarioMeta?.id;
    if (!targetId) return [];

    const grouped = new Map<string, {
      position_id: string;
      label: string;
      pnl: number;
      abs: number;
    }>();

    for (const row of topStressContributors) {
      if (row.scenario_id !== targetId) continue;
      const current = grouped.get(row.position_id) ?? {
        position_id: row.position_id,
        label: formatPositionLabel(positionsById.get(row.position_id), row.position_id),
        pnl: 0,
        abs: 0,
      };
      current.pnl += Number(row.pnl_contribution ?? 0);
      current.abs += Number(row.abs_pnl_contribution ?? 0);
      grouped.set(row.position_id, current);
    }

    return Array.from(grouped.values())
      .sort((left, right) => right.abs - left.abs)
      .slice(0, 8);
  }, [activeScenarioId, activeScenarioMeta?.id, positionsById, topStressContributors]);

  const heuristicContributorRows = useMemo(() => {
    if (!activeScenarioMeta) return [];

    return dataState.portfolio.positions
      .map((position) => {
        const mass = positionRiskMass(position);
        const weights = inferPositionFactorWeights(position, baseCurrency);
        const pressure = (Object.entries(activeScenarioMeta.shocks) as [MacroFactor, number][])
          .reduce((acc, [factor, shock]) => acc + mass * weights[factor] * Math.abs(shock), 0);
        return {
          position_id: position.position_id,
          label: formatPositionLabel(position, position.position_id),
          pressure,
          instrument_type: position.instrument_type,
        };
      })
      .filter((row) => row.pressure > 0)
      .sort((left, right) => right.pressure - left.pressure)
      .slice(0, 8);
  }, [activeScenarioMeta, baseCurrency, dataState.portfolio.positions]);

  const decompositionRows = useMemo<DecompositionRow[]>(() => {
    if (actualContributorRows.length) {
      return actualContributorRows.map((row) => ({
        key: row.position_id,
        label: shortenLabel(row.label, 22),
        fullLabel: row.label,
        value: row.pnl,
        tone: row.pnl < 0 ? "negative" : "positive",
        mode: "actual",
        meta: formatNumber(row.pnl, 2),
      }));
    }

    return heuristicContributorRows.map((row) => ({
      key: row.position_id,
      label: shortenLabel(row.label, 22),
      fullLabel: row.label,
      value: row.pressure,
      tone: "neutral",
      mode: "pressure",
      meta: row.instrument_type,
    }));
  }, [actualContributorRows, heuristicContributorRows]);

  const activeScenarioFactorImpact = useMemo(() => {
    if (!activeScenarioMeta) return [];

    const raw = (Object.entries(FACTOR_LABELS) as [MacroFactor, string][])
      .map(([factor, label]) => {
        const shock = activeScenarioMeta.shocks[factor] ?? 0;
        const exposureScore = factorExposure[factor];
        const pressureScore = exposureScore * Math.abs(shock);
        return {
          factor,
          label,
          shock,
          tone: FACTOR_TONES[factor],
          exposureScore,
          pressureScore,
        };
      })
      .filter((row) => row.exposureScore > 0 || row.pressureScore > 0 || row.shock !== 0)
      .sort((left, right) => right.pressureScore - left.pressureScore || right.exposureScore - left.exposureScore);

    const maxPressure = Math.max(...raw.map((row) => row.pressureScore), 1);
    const maxExposure = Math.max(...raw.map((row) => row.exposureScore), 1);
    return raw.map((row) => ({
      ...row,
      relative: (row.pressureScore / maxPressure) * 100,
      portfolioRelative: (row.exposureScore / maxExposure) * 100,
    }));
  }, [activeScenarioMeta, factorExposure]);

  const radarData = useMemo(() => {
    const lookup = new Map(activeScenarioFactorImpact.map((row) => [row.factor, row]));
    return (Object.entries(FACTOR_LABELS) as [MacroFactor, string][])
      .map(([factor, label]) => ({
        label,
        exposure: Number((lookup.get(factor)?.portfolioRelative ?? 0).toFixed(1)),
        pressure: Number((lookup.get(factor)?.relative ?? 0).toFixed(1)),
        shock: lookup.get(factor)?.shock ?? 0,
      }));
  }, [activeScenarioFactorImpact]);

  const stressChartData = useMemo(() => {
    return stressRowsDetailed.map((row) => ({
      scenario_id: row.scenario_id,
      label: row.descriptor.short,
      fullName: row.descriptor.name,
      pnl: row.pnl,
      limit: row.limit ?? null,
      fill: row.pnl < 0 ? (row.breached ? "#ff8f8f" : "#ffb86a") : "#6eff8e",
    }));
  }, [stressRowsDetailed]);

  const cumulativeStressData = useMemo(() => {
    if (!stressRowsDetailed.length) return [];
    let running = 0;
    return stressRowsDetailed.map((row) => {
      running += row.pnl;
      return {
        label: row.descriptor.short,
        value: running,
      };
    });
  }, [stressRowsDetailed]);

  const maxRelevance = useMemo(
    () => Math.max(rankedCatalog[0]?.relevance ?? 0, 1),
    [rankedCatalog]
  );

  const limitedScenarioCount = stressRowsDetailed.filter((row) => row.limit !== null && row.limit !== undefined).length;
  const breachCount = stressRowsDetailed.filter((row) => row.breached).length;
  const scenariosWithoutLimitCount = Math.max(stressRowsDetailed.length - limitedScenarioCount, 0);
  const okScenarioCount = Math.max(limitedScenarioCount - breachCount, 0);
  const breachShare = limitedScenarioCount ? (breachCount / limitedScenarioCount) * 100 : 0;
  const limitCoverageShare = stressRowsDetailed.length ? (limitedScenarioCount / stressRowsDetailed.length) * 100 : 0;
  const worst = stressRowsDetailed[0]?.pnl;
  const best = stressRowsDetailed[stressRowsDetailed.length - 1]?.pnl;
  const spread = worst !== undefined && best !== undefined ? best - worst : undefined;

  const selectedIdsKey = [...selectedScenarioDTOs.map((scenario) => scenario.scenario_id)].sort().join("|");
  const resultIdsKey = [...stressRowsDetailed.map((row) => row.scenario_id)].sort().join("|");
  const resultsNeedRefresh = Boolean(selectedScenarioDTOs.length)
    && (stressRowsDetailed.length === 0 || selectedIdsKey !== resultIdsKey);

  const activeScenarioColor = CATEGORY_COLORS[activeScenarioMeta?.category ?? "Scenario"] ?? "#7da7ff";
  const updatedAtLabel = formatComputedAt(dataState.results.computedAt);

  const breachData = [
    { name: "Превышение", value: breachCount, fill: "#ff8f8f" },
    { name: "В пределах лимита", value: okScenarioCount, fill: "#6eff8e" },
    { name: "Без лимита", value: scenariosWithoutLimitCount, fill: "#ffb86a" },
  ].filter((row) => row.value > 0);

  const scenarioMixData = useMemo(() => {
    const source = stressRowsDetailed.length
      ? stressRowsDetailed.map((row) => row.descriptor)
      : selectedCatalog;

    const grouped = new Map<string, { category: string; value: number; fill: string }>();
    for (const scenario of source) {
      const current = grouped.get(scenario.category) ?? {
        category: scenario.category,
        value: 0,
        fill: CATEGORY_COLORS[scenario.category] ?? "#7da7ff",
      };
      current.value += 1;
      grouped.set(scenario.category, current);
    }

    return Array.from(grouped.values()).sort((left, right) => right.value - left.value);
  }, [selectedCatalog, stressRowsDetailed]);

  const recalcNow = async () => {
    if (!selectedScenarioDTOs.length) {
      setStatusTone("danger");
      setStatus("Выберите хотя бы один сценарий.");
      return;
    }

    setStatus("");
    setIsRecalc(true);
    dataDispatch({ type: "SET_SCENARIOS", scenarios: selectedScenarioDTOs });

    const calcRunId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const useAutoMarketData = (dataState.marketDataMode ?? "api_auto") === "api_auto";

    dispatch({ type: "SET_CALC_RUN", calcRunId, status: "running", startedAt });

    try {
      const updated = await runRiskCalculation({
        positions: dataState.portfolio.positions,
        scenarios: selectedScenarioDTOs,
        limits: dataState.limits ?? undefined,
        alpha,
        horizonDays,
        parametricTailModel,
        baseCurrency,
        fxRates,
        liquidityModel,
        selectedMetrics: selectedMetricsForRun,
        marginEnabled: wf.calcConfig.marginEnabled,
        marketDataSessionId: useAutoMarketData ? undefined : dataState.marketDataSummary?.session_id,
        forceAutoMarketData: useAutoMarketData,
      });

      dataDispatch({ type: "SET_RESULTS", metrics: updated });
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "success", startedAt, finishedAt: new Date().toISOString() });
      setStatusTone("success");
      setStatus(`Результаты пересчитаны по ${selectedScenarioDTOs.length} стресс-сценариям.`);
    } catch (error: any) {
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "error", startedAt, finishedAt: new Date().toISOString() });
      setStatusTone("danger");
      setStatus(error?.message ?? "Ошибка пересчёта");
    } finally {
      setIsRecalc(false);
    }
  };

  const toggleScenario = (id: string) => {
    setSelectedScenarioIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActiveScenarioId(id);
  };

  const activeChartIndex = Math.max(0, CHART_CARD_META.findIndex((item) => item.id === activeChartId));

  const scrollToChart = (chartId: ChartCardId) => {
    setActiveChartId(chartId);
    chartCardRefs.current[chartId]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start",
    });
  };

  const shiftChart = (direction: -1 | 1) => {
    const nextIndex = Math.min(CHART_CARD_META.length - 1, Math.max(0, activeChartIndex + direction));
    const nextCard = CHART_CARD_META[nextIndex];
    if (nextCard) scrollToChart(nextCard.id);
  };

  const handleChartRailScroll = () => {
    const rail = chartRailRef.current;
    if (!rail) return;

    let closestId: ChartCardId | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const item of CHART_CARD_META) {
      const element = chartCardRefs.current[item.id];
      if (!element) continue;
      const distance = Math.abs(element.offsetLeft - rail.scrollLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = item.id;
      }
    }

    if (closestId && closestId !== activeChartId) {
      setActiveChartId(closestId);
    }
  };

  return (
    <div className="importPagePlain stressPage">
      <div className="importHeroRow stressHeroRow">
        <div className="stressHeroIntro">
          <span className="stressHeroEyebrow">Stress testing</span>
          <h1 className="pageTitle">Стресс-сценарии</h1>
          <p className="pageHint">
            Страница предлагает макро-шоки под ваш портфель, даёт понятный профиль влияния и пересчитывает итоговый stress P&amp;L через текущий бек.
          </p>
          <div className="importHeroMeta">
            <Chip color="primary" variant="flat" radius="sm" size="sm">{selectedScenarioDTOs.length} в наборе</Chip>
            <span className="importFileTag">обновлено {updatedAtLabel}</span>
            {metrics?.mode ? <span className="importFileTag">режим {metrics.mode}</span> : null}
          </div>
        </div>

        <div className="stressHeaderSide">
          <div className="stressHeaderPills">
            <Chip color="primary" variant="flat" radius="sm">
              live-набор {selectedScenarioDTOs.length}
            </Chip>
            <Chip color={resultsNeedRefresh ? "warning" : "success"} variant="flat" radius="sm">
              {resultsNeedRefresh ? "нужен пересчёт" : "графики актуальны"}
            </Chip>
          </div>

          <Button variant="ghost" onClick={() => nav("/dashboard")}>
            К дашборду
          </Button>
        </div>
      </div>

      {(resultsNeedRefresh || status || (metrics && !stressRowsDetailed.length)) ? (
        <div className="stressStatusStrip">
          {metrics && !stressRowsDetailed.length ? (
            <Chip color="warning" variant="flat" radius="sm">
              Для этого запуска stress-результаты ещё не рассчитаны. Выберите сценарии и нажмите «Пересчитать».
            </Chip>
          ) : null}
          {resultsNeedRefresh ? (
            <Chip color="warning" variant="flat" radius="sm">
              Текущий набор сценариев отличается от последнего расчёта. Для обновления графиков нужен пересчёт.
            </Chip>
          ) : null}
          {status ? (
            <Chip color={statusTone} variant="flat" radius="sm">
              {status}
            </Chip>
          ) : null}
        </div>
      ) : null}

      {!metrics ? (
        <Card className="marketTabsCard">
          <div className="marketBoardTitle">Нет результатов расчёта</div>
          <div className="marketBoardSub">
            Сначала выполните расчёт на странице конфигурации или на дашборде, затем возвращайтесь к сценариям.
          </div>
          <div className="runActionRow">
            <Button onClick={() => nav("/configure")}>К конфигурации</Button>
            <Button variant="secondary" onClick={() => nav("/dashboard")}>К результатам</Button>
          </div>
        </Card>
      ) : (
        <>
          <Reveal>
            <div className="stressTopGrid">
              <Card className="marketTabsCard stressCatalogSection stressCatalogSection--primary">
                <div className="stressPanelHeader">
                  <div>
                    <div className="stressPanelTitle">Каталог макро-сценариев</div>
                    <div className="stressPanelSub">
                      Здесь собирается рабочий набор стрессов. Повторный клик снимает сценарий, а выбор сразу обновляет набор в состоянии приложения.
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => setShowCatalog((value) => !value)}>
                    {showCatalog ? "Свернуть" : `Открыть каталог (${rankedCatalog.length})`}
                  </Button>
                </div>

                {showCatalog ? (
                  <div className="stressCatalogGrid">
                    {rankedCatalog.map((scenario) => {
                      const selected = selectedScenarioIds.has(scenario.id);
                      const active = activeScenarioId === scenario.id;
                      const relevanceShare = Math.max(0, Math.min(100, (scenario.relevance / maxRelevance) * 100));
                      const cardStyle = {
                        "--stress-accent": CATEGORY_COLORS[scenario.category] ?? "#7da7ff",
                      } as CSSProperties;

                      return (
                        <button
                          key={scenario.id}
                          type="button"
                          onClick={() => toggleScenario(scenario.id)}
                          className={`stressScenarioCard ${selected ? "stressScenarioCard--selected" : ""} ${active ? "stressScenarioCard--active" : ""}`}
                          style={cardStyle}
                          aria-pressed={selected}
                        >
                          <div className="stressScenarioHead">
                            <div className="stressScenarioHeadMain">
                              <span className="stressScenarioIcon">{scenario.icon}</span>
                              <div className="stressScenarioText">
                                <strong>{scenario.name}</strong>
                                <div className="stressScenarioMeta">
                                  <span className="stressScenarioCategory">{scenario.category}</span>
                                  <span className="textMuted">{scenario.tags.join(" · ")}</span>
                                </div>
                              </div>
                            </div>
                            <span className="stressScenarioCheck">{selected ? "✓" : "○"}</span>
                          </div>

                          <p className="stressScenarioDesc">{scenario.description}</p>

                          <div className="stressScenarioMetricGrid">
                            <div className="stressScenarioMetric">
                              <span>ΔS</span>
                              <strong>{formatSignedPercent(scenario.model.underlying_shift)}</strong>
                            </div>
                            <div className="stressScenarioMetric">
                              <span>ΔVol</span>
                              <strong>{formatSignedPercent(scenario.model.volatility_shift)}</strong>
                            </div>
                            <div className="stressScenarioMetric">
                              <span>Δr</span>
                              <strong>{formatSignedPercent(scenario.model.rate_shift)}</strong>
                            </div>
                          </div>

                          <div className="stressScenarioRelevance">
                            <div className="stressScenarioRelevanceHead">
                              <span>Релевантность</span>
                              <span>{relevanceShare.toFixed(0)}%</span>
                            </div>
                            <div className="stressScenarioRelevanceTrack">
                              <div className="stressScenarioRelevanceFill" style={{ width: `${relevanceShare}%` }} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="stressCatalogCollapsed">
                    Каталог скрыт. В рабочем наборе сейчас {selectedScenarioDTOs.length} сценариев, набор продолжает жить в правой панели.
                  </div>
                )}
              </Card>

              <Card className="marketTabsCard stressDetailCard stressWorkbenchCard" style={{ "--stress-accent": activeScenarioColor } as CSSProperties}>
                <div className="stressPanelHeader">
                  <div>
                    <div className="stressPanelTitle">Влияние сценария на портфель</div>
                    <div className="stressPanelSub">
                      Live-набор обновляется сразу при выборе. Можно отметить несколько сценариев, и они вместе пойдут в следующий пересчёт.
                    </div>
                  </div>
                  <Chip color="primary" variant="flat" radius="sm">
                    Live · {selectedScenarioDTOs.length}
                  </Chip>
                </div>

                <div className="stressWorkbenchActions">
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedScenarioIds(new Set(rankedCatalog.slice(0, 5).map((scenario) => scenario.id)))}
                  >
                    Топ-5
                  </Button>
                  <Button variant="ghost" onClick={() => setSelectedScenarioIds(new Set(rankedCatalog.map((scenario) => scenario.id)))}>
                    Все
                  </Button>
                  <Button variant="ghost" onClick={() => setSelectedScenarioIds(new Set())}>
                    Очистить
                  </Button>
                  <Button variant="secondary" loading={isRecalc} disabled={!selectedScenarioDTOs.length || isRecalc} onClick={recalcNow}>
                    Пересчитать
                  </Button>
                  <Button variant="ghost" onClick={() => nav("/dashboard")}>
                    К дашборду
                  </Button>
                </div>

                <div className="stressLiveNote">
                  Набор сценариев синхронизируется без кнопки «Применить». Графики ниже показывают последний расчёт, а правая панель сразу отражает текущий live-выбор.
                </div>

                <div className="stressWorkbenchStats">
                  <div className="stressWorkbenchStat">
                    <span>В наборе</span>
                    <strong>{selectedScenarioDTOs.length}</strong>
                    <small>выбрано сейчас</small>
                  </div>
                  <div className="stressWorkbenchStat">
                    <span>В расчёте</span>
                    <strong>{stressRowsDetailed.length}</strong>
                    <small>сценариев в последних результатах</small>
                  </div>
                  <div className="stressWorkbenchStat">
                    <span>Статус</span>
                    <strong>{resultsNeedRefresh ? "нужен запуск" : "актуально"}</strong>
                    <small>{resultsNeedRefresh ? "live-набор отличается от расчёта" : "графики соответствуют набору"}</small>
                  </div>
                  <div className="stressWorkbenchStat">
                    <span>Размах</span>
                    <strong>{spread !== undefined ? formatCompactMoney(spread) : "—"}</strong>
                    <small>{worst !== undefined && best !== undefined ? "лучший минус худший" : "появится после запуска"}</small>
                  </div>
                </div>

                <div className="stressSelectionList">
                  {selectedCatalog.length ? selectedCatalog.map((scenario) => {
                    const isActive = activeScenarioMeta?.id === scenario.id;
                    return (
                      <button
                        key={`selected-${scenario.id}`}
                        type="button"
                        className={`stressSelectionItem ${isActive ? "stressSelectionItem--active" : ""}`}
                        onClick={() => setActiveScenarioId(scenario.id)}
                      >
                        <div className="stressSelectionItemHead">
                          <strong>{scenario.icon} {scenario.name}</strong>
                          <span className="stressSelectionItemTag">{scenario.category}</span>
                        </div>
                        <div className="stressSelectionItemMeta">
                          <span>{scenario.tags.join(" · ")}</span>
                          <span>{Math.max(0, Math.min(100, (scenario.relevance / maxRelevance) * 100)).toFixed(0)}%</span>
                        </div>
                      </button>
                    );
                  }) : (
                    <div className="stressEmptyState stressEmptyState--compact">
                      Слева пока не выбран ни один сценарий.
                    </div>
                  )}
                </div>

                {activeScenarioMeta ? (
                  <div className="stressDetailTop">
                    <div className="stressDetailLead">
                      <div>
                        <div className="stressDetailEyebrow">{activeScenarioMeta.category}</div>
                        <div className="stressDetailTitle">{activeScenarioMeta.icon} {activeScenarioMeta.name}</div>
                        <div className="stressDetailDesc">{activeScenarioMeta.description}</div>
                      </div>
                      {activeStressRow ? (
                        <Chip color={activeStressRow.breached ? "danger" : activeStressRow.limit != null ? "success" : "default"} variant="flat" radius="sm">
                          {activeStressRow.breached ? "Лимит превышен" : activeStressRow.limit != null ? "В пределах лимита" : "Без лимита"}
                        </Chip>
                      ) : (
                        <Chip color="warning" variant="flat" radius="sm">
                          В live-наборе
                        </Chip>
                      )}
                    </div>

                    <div className="stressImpactMetaGrid">
                      <div className="stressImpactMetaCard">
                        <span>P&amp;L</span>
                        <strong className={activeStressRow && activeStressRow.pnl < 0 ? "dashboardValueNegative" : "dashboardValuePositive"}>
                          {activeStressRow ? formatNumber(activeStressRow.pnl, 2) : "—"}
                        </strong>
                      </div>
                      <div className="stressImpactMetaCard">
                        <span>Релевантность</span>
                        <strong>
                          {Math.max(
                            0,
                            Math.min(
                              100,
                              (((rankedCatalog.find((scenario) => scenario.id === activeScenarioMeta.id)?.relevance) ?? 0) / maxRelevance) * 100
                            )
                          ).toFixed(0)}%
                        </strong>
                      </div>
                      <div className="stressImpactMetaCard">
                        <span>Лимит</span>
                        <strong>{activeStressRow?.limit != null ? formatNumber(activeStressRow.limit, 2) : "не задан"}</strong>
                      </div>
                    </div>

                    <div className="stressShiftGrid">
                      <div className="stressShiftCell">
                        <span>ΔS</span>
                        <strong>{formatSignedPercent(activeScenarioMeta.model.underlying_shift)}</strong>
                      </div>
                      <div className="stressShiftCell">
                        <span>ΔVol</span>
                        <strong>{formatSignedPercent(activeScenarioMeta.model.volatility_shift)}</strong>
                      </div>
                      <div className="stressShiftCell">
                        <span>Δr</span>
                        <strong>{formatSignedPercent(activeScenarioMeta.model.rate_shift)}</strong>
                      </div>
                    </div>

                    <div className="stressFactorList">
                      {activeScenarioFactorImpact.length ? (
                        activeScenarioFactorImpact.map((row) => (
                          <div key={row.factor} className="stressFactorRow">
                            <div className="stressFactorHead">
                              <span>{row.label}</span>
                              <div className="stressFactorValueGroup">
                                <span className={`stressImpactValue stressImpactValue--${row.shock < 0 ? "negative" : row.shock > 0 ? "positive" : "neutral"}`}>
                                  {formatSignedPercent(row.shock)}
                                </span>
                                <span className="stressFactorMeta">
                                  портфель {row.portfolioRelative.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                            <div className="stressImpactTrack">
                              <div
                                className={`stressImpactFill stressImpactFill--${row.tone}`}
                                style={{ width: `${Math.max(6, row.relative)}%` }}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="stressEmptyState stressEmptyState--compact">
                          По этому сценарию пока нет выраженных факторных нагрузок.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <Card className="marketTabsCard stressDeckCard">
              <div className="stressDeckHead">
                <div>
                  <div className="stressPanelTitle">Графики стресс-профиля</div>
                  <div className="stressPanelSub">
                    Внизу собраны ключевые карточки. Их можно листать влево-вправо, а активная карточка занимает главный фокус.
                  </div>
                </div>
                <div className="stressDeckNav">
                  <Button variant="ghost" onClick={() => shiftChart(-1)} disabled={activeChartIndex === 0}>←</Button>
                  <Button variant="ghost" onClick={() => shiftChart(1)} disabled={activeChartIndex === CHART_CARD_META.length - 1}>→</Button>
                </div>
              </div>

              <div className="stressDeckTabs" role="tablist" aria-label="Графики stress page">
                {CHART_CARD_META.map((item) => (
                  <button
                    key={`tab-${item.id}`}
                    type="button"
                    className={`stressDeckTab ${activeChartId === item.id ? "stressDeckTab--active" : ""}`}
                    onClick={() => scrollToChart(item.id)}
                    role="tab"
                    aria-selected={activeChartId === item.id}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="stressChartRail" ref={chartRailRef} onScroll={handleChartRailScroll}>
                <section
                  className="stressChartSlide"
                  data-chart-card="stress_pnl"
                  ref={(node) => { chartCardRefs.current.stress_pnl = node; }}
                >
                  <div className="stressPanelHeader">
                    <div>
                      <div className="stressPanelTitle">Stress P&amp;L по сценариям</div>
                      <div className="stressPanelSub">
                        Фактический P&amp;L по последнему расчёту. Столбцы отсортированы от худшего сценария к лучшему.
                      </div>
                    </div>
                    <Chip color={worst !== undefined && worst < 0 ? "danger" : "success"} variant="flat" radius="sm">
                      {stressRowsDetailed.length ? `${stressRowsDetailed.length} сценариев` : "нет данных"}
                    </Chip>
                  </div>

                  {stressChartData.length ? (
                    <div className="stressChartWrap">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stressChartData} margin={{ top: 8, right: 18, bottom: 24, left: 6 }}>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: "rgba(244,241,234,0.56)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={formatCompactMoney} tick={{ fill: "rgba(244,241,234,0.56)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
                          <Tooltip content={<ScenarioChartTooltip suffix={baseCurrency} />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                          <Bar dataKey="pnl" radius={[10, 10, 0, 0]} maxBarSize={46} onClick={(_, index) => setActiveScenarioId(stressChartData[index]?.scenario_id ?? null)}>
                            {stressChartData.map((row) => (
                              <Cell
                                key={row.scenario_id}
                                fill={row.fill}
                                fillOpacity={activeScenarioId && activeScenarioId !== row.scenario_id ? 0.58 : 0.94}
                                stroke={activeScenarioId === row.scenario_id ? "rgba(255,255,255,0.42)" : "transparent"}
                                strokeWidth={activeScenarioId === row.scenario_id ? 1.2 : 0}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="stressEmptyState">
                      Для текущего запуска нет stress-результатов.
                      <br />
                      Выберите сценарии и пересчитайте портфель.
                    </div>
                  )}
                </section>

                <section
                  className="stressChartSlide"
                  data-chart-card="cumulative"
                  ref={(node) => { chartCardRefs.current.cumulative = node; }}
                >
                  <div className="stressPanelHeader">
                    <div>
                      <div className="stressPanelTitle">Кумулятивный стресс</div>
                      <div className="stressPanelSub">
                        Накопленный P&amp;L, если упорядочить сценарии от худшего исхода к лучшему.
                      </div>
                    </div>
                    <Chip color={best !== undefined && best >= 0 ? "success" : "default"} variant="flat" radius="sm">
                      {stressRowsDetailed.length ? "упорядоченный ряд" : "нет ряда"}
                    </Chip>
                  </div>

                  {cumulativeStressData.length ? (
                    <div className="stressChartWrap stressChartWrap--medium">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={cumulativeStressData} margin={{ top: 8, right: 16, bottom: 12, left: 6 }}>
                          <defs>
                            <linearGradient id="stressCumGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#7da7ff" stopOpacity={0.32} />
                              <stop offset="100%" stopColor="#7da7ff" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: "rgba(244,241,234,0.56)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={formatCompactMoney} tick={{ fill: "rgba(244,241,234,0.56)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
                          <Tooltip content={<ScenarioChartTooltip suffix={baseCurrency} />} />
                          <Area
                            type="monotone"
                            dataKey="value"
                            name="Cumulative"
                            stroke="#7da7ff"
                            strokeWidth={2.4}
                            fill="url(#stressCumGradient)"
                            dot={{ r: 3, stroke: "#7da7ff", strokeWidth: 2, fill: "rgba(16,18,24,0.94)" }}
                            activeDot={{ r: 4 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="stressEmptyState">
                      Кумулятивный ряд появится после первого stress-расчёта.
                    </div>
                  )}
                </section>

                <section
                  className="stressChartSlide"
                  data-chart-card="breach"
                  ref={(node) => { chartCardRefs.current.breach = node; }}
                >
                  <div className="stressPanelHeader">
                    <div>
                      <div className="stressPanelTitle">Breach share</div>
                      <div className="stressPanelSub">
                        Доля нарушений среди тех сценариев, для которых backend реально получил stress-лимит.
                      </div>
                    </div>
                  </div>

                  {stressRowsDetailed.length ? (
                    <div className="stressDonutStack">
                      <div className="stressDonutRow">
                        <div className="stressDonutChart">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={breachData} dataKey="value" innerRadius={42} outerRadius={64} stroke="none" startAngle={90} endAngle={-270}>
                                {breachData.map((row) => (
                                  <Cell key={row.name} fill={row.fill} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="stressDonutMeta">
                          <div className="stressDonutValue">{limitedScenarioCount ? `${breachShare.toFixed(0)}%` : "нет"}</div>
                          <div className="stressDonutLabel">
                            {limitedScenarioCount
                              ? `${breachCount} из ${limitedScenarioCount} сценариев пробили stress-лимит`
                              : "В этом расчёте stress-лимиты не были переданы, поэтому breach сейчас считать не из чего"}
                          </div>
                        </div>
                      </div>

                      <div className="stressBreachStats">
                        <div className="stressBreachStat">
                          <span>Покрытие лимитами</span>
                          <strong>{limitCoverageShare.toFixed(0)}%</strong>
                        </div>
                        <div className="stressBreachStat">
                          <span>Без лимита</span>
                          <strong>{scenariosWithoutLimitCount}</strong>
                        </div>
                        <div className="stressBreachStat">
                          <span>Ок / breach</span>
                          <strong>{okScenarioCount} / {breachCount}</strong>
                        </div>
                      </div>

                      <div className="stressDonutLegend">
                        {breachData.map((row) => (
                          <div key={`legend-${row.name}`} className="stressDonutLegendItem">
                            <span className="stressDonutLegendDot" style={{ background: row.fill }} aria-hidden="true" />
                            <span>{row.name}</span>
                            <strong>{row.value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="stressEmptyState">
                      Breach share появится после первого stress-расчёта.
                    </div>
                  )}
                </section>

                <section
                  className="stressChartSlide"
                  data-chart-card="factors"
                  ref={(node) => { chartCardRefs.current.factors = node; }}
                >
                  <div className="stressPanelHeader">
                    <div>
                      <div className="stressPanelTitle">Факторный профиль</div>
                      <div className="stressPanelSub">
                        Паутинка сравнивает базовую экспозицию портфеля по факторам и давление выбранного сценария на эти же факторы.
                      </div>
                    </div>
                  </div>

                  {activeScenarioMeta ? (
                    <>
                      <div className="stressChartWrap stressChartWrap--small">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData} outerRadius="72%">
                            <PolarGrid stroke="rgba(255,255,255,0.08)" />
                            <PolarAngleAxis dataKey="label" tick={{ fill: "rgba(244,241,234,0.62)", fontSize: 10 }} />
                            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                            <Tooltip content={<FactorProfileTooltip />} />
                            <Radar
                              name="Экспозиция портфеля"
                              dataKey="exposure"
                              stroke="#cdb8ff"
                              fill="#cdb8ff"
                              fillOpacity={0.1}
                              strokeWidth={1.8}
                              dot={{ r: 2.5, fill: "#cdb8ff", strokeWidth: 0 }}
                            />
                            <Radar
                              name="Давление сценария"
                              dataKey="pressure"
                              stroke={activeScenarioColor}
                              fill={activeScenarioColor}
                              fillOpacity={0.18}
                              strokeWidth={2.2}
                              dot={{ r: 3, fill: activeScenarioColor, strokeWidth: 0 }}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="stressRadarLegend">
                        <div className="stressRadarLegendItem">
                          <span className="stressRadarLegendDot" style={{ background: "#cdb8ff" }} aria-hidden="true" />
                          <span>Экспозиция портфеля</span>
                        </div>
                        <div className="stressRadarLegendItem">
                          <span className="stressRadarLegendDot" style={{ background: activeScenarioColor }} aria-hidden="true" />
                          <span>Давление сценария</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="stressEmptyState">
                      Выберите сценарий для построения профиля.
                    </div>
                  )}
                </section>

                <section
                  className="stressChartSlide"
                  data-chart-card="decomposition"
                  ref={(node) => { chartCardRefs.current.decomposition = node; }}
                >
                  <div className="stressPanelHeader">
                    <div>
                      <div className="stressPanelTitle">Декомпозиция по позициям</div>
                      <div className="stressPanelSub">
                        {actualContributorRows.length
                          ? "Фактический вклад позиций в выбранный сценарий по последнему расчёту."
                          : activeScenarioMeta
                            ? "До пересчёта показывается оценка чувствительности позиций к выбранному сценарию."
                            : "Выберите сценарий для детализации."}
                      </div>
                    </div>
                  </div>

                  {decompositionRows.length ? (
                    <div className="stressChartWrap stressChartWrap--medium">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={decompositionRows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 6 }}>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                          <XAxis type="number" tickFormatter={formatCompactMoney} tick={{ fill: "rgba(244,241,234,0.56)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="label" width={132} tick={{ fill: "rgba(244,241,234,0.62)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <ReferenceLine x={0} stroke="rgba(255,255,255,0.18)" />
                          <Tooltip content={<ScenarioChartTooltip suffix={decompositionRows[0]?.mode === "actual" ? baseCurrency : "score"} />} />
                          <Bar dataKey="value" radius={[0, 10, 10, 0]} maxBarSize={26}>
                            {decompositionRows.map((row) => (
                              <Cell
                                key={row.key}
                                fill={row.tone === "negative" ? "#ff8f8f" : row.tone === "positive" ? "#6eff8e" : "#7da7ff"}
                                fillOpacity={0.88}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="stressEmptyState">
                      Детализация по позициям появится после выбора сценария и расчёта.
                    </div>
                  )}
                </section>

                <section
                  className="stressChartSlide"
                  data-chart-card="mix"
                  ref={(node) => { chartCardRefs.current.mix = node; }}
                >
                  <div className="stressPanelHeader">
                    <div>
                      <div className="stressPanelTitle">Структура набора</div>
                      <div className="stressPanelSub">
                        Распределение выбранных или уже рассчитанных стрессов по типам рыночного риска.
                      </div>
                    </div>
                  </div>

                  {scenarioMixData.length ? (
                    <div className="stressChartWrap stressChartWrap--tiny">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={scenarioMixData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 6 }}>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tick={{ fill: "rgba(244,241,234,0.56)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="category" width={90} tick={{ fill: "rgba(244,241,234,0.62)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<ScenarioChartTooltip suffix="шт." />} />
                          <Bar dataKey="value" radius={[0, 10, 10, 0]} maxBarSize={22}>
                            {scenarioMixData.map((row) => (
                              <Cell key={row.category} fill={row.fill} fillOpacity={0.9} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="stressEmptyState">
                      После выбора сценариев здесь появится структура набора.
                    </div>
                  )}
                </section>
              </div>
            </Card>
          </Reveal>
        </>
      )}
    </div>
  );
}
