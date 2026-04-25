import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { ScenarioDTO } from "../api/contracts/metrics";
import { PositionDTO } from "../api/types";
import { useAppData } from "../state/appDataStore";
import Card from "../ui/Card";
import { WorkflowStep } from "../workflow/workflowTypes";
import { useWorkflow } from "../workflow/workflowStore";

type MacroFactor = "fx_rub" | "rates_rub" | "eq_moex" | "credit_spread" | "vol_surface" | "oil_brent";
type FactorTone = "positive" | "negative" | "neutral" | "warning";
type ChartCardId = "stress_pnl" | "cumulative" | "breach" | "factor_profile" | "positions";

type ScenarioDescriptor = {
  id: string;
  name: string;
  short: string;
  category: string;
  icon: string;
  description: string;
  shocks: Partial<Record<MacroFactor, number>>;
  model: {
    underlying_shift: number;
    volatility_shift: number;
    rate_shift: number;
  };
  source: "macro" | "configured";
};

type PositionProfile = {
  position: PositionDTO;
  label: string;
  exposure: number;
  direction: number;
  sensitivities: Record<MacroFactor, number>;
};

type PositionImpactRow = {
  position_id: string;
  label: string;
  type: PositionDTO["instrument_type"];
  pnl: number;
};

type ScenarioInsight = {
  id: string;
  scenario: ScenarioDescriptor;
  relevance: number;
  pnl: number;
  factorPnl: Record<MacroFactor, number>;
  positions: PositionImpactRow[];
};

type ChartCardMeta = {
  id: ChartCardId;
  label: string;
};

const FACTOR_ORDER: MacroFactor[] = [
  "fx_rub",
  "rates_rub",
  "eq_moex",
  "credit_spread",
  "vol_surface",
  "oil_brent",
];

const CHART_CARDS: ChartCardMeta[] = [
  { id: "stress_pnl", label: "Stress P&L" },
  { id: "cumulative", label: "Кумулятивный стресс" },
  { id: "breach", label: "Breach share" },
  { id: "factor_profile", label: "Факторный профиль" },
  { id: "positions", label: "Концентрация по позициям" },
];

const FACTOR_LABELS: Record<MacroFactor, string> = {
  fx_rub: "FX RUB",
  rates_rub: "Ставки RUB",
  eq_moex: "Акции MOEX",
  credit_spread: "Кред. спреды",
  vol_surface: "Волатильность",
  oil_brent: "Нефть Brent",
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

const DEFAULT_STRESS_SCENARIOS: ScenarioDescriptor[] = [
  {
    id: "rub_deval_20",
    name: "Девальвация RUB -20%",
    short: "RUB -20%",
    category: "FX",
    icon: "💱",
    description: "Резкое ослабление рубля на 20% к корзине валют.",
    shocks: { fx_rub: -0.2, rates_rub: 0.03, eq_moex: -0.15 },
    model: { underlying_shift: -0.18, volatility_shift: 0.2, rate_shift: 0.03 },
    source: "macro",
  },
  {
    id: "cbr_hike_300",
    name: "ЦБ поднимает ставку +300 б.п.",
    short: "КС +300",
    category: "Rates",
    icon: "🏦",
    description: "Экстренное ужесточение ДКП и давление на процентные позиции.",
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
    description: "Смягчение денежно-кредитной политики и поддержка облигаций.",
    shocks: { rates_rub: -0.02, eq_moex: 0.05, credit_spread: -0.005 },
    model: { underlying_shift: 0.04, volatility_shift: -0.06, rate_shift: -0.02 },
    source: "macro",
  },
  {
    id: "oil_crash_35",
    name: "Обвал Brent -35%",
    short: "Brent -35%",
    category: "Commodity",
    icon: "🛢️",
    description: "Сырьевой шок по нефти, рублю и акциям нефтегазового блока.",
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
    description: "Широкое падение рынка акций и рост risk-off поведения.",
    shocks: { eq_moex: -0.25, credit_spread: 0.02, vol_surface: 0.4 },
    model: { underlying_shift: -0.25, volatility_shift: 0.4, rate_shift: 0.005 },
    source: "macro",
  },
  {
    id: "credit_spread_250",
    name: "Кредитный спред +250 б.п.",
    short: "Спреды +250",
    category: "Credit",
    icon: "💳",
    description: "Расширение кредитных спредов и переоценка риска эмитентов.",
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
    description: "Удвоение implied volatility и давление на опционные позиции.",
    shocks: { vol_surface: 1.0, eq_moex: -0.12, fx_rub: -0.05 },
    model: { underlying_shift: -0.08, volatility_shift: 1.0, rate_shift: 0.0 },
    source: "macro",
  },
  {
    id: "sanctions_new",
    name: "Новые санкции",
    short: "Санкции",
    category: "Geopolitical",
    icon: "🚫",
    description: "Комплексный геополитический шок по валюте, акциям и фондированию.",
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
    description: "Замедление мировой экономики с падением спроса на риск и сырьё.",
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
    description: "Ускорение инфляции и новое давление на кривую процентных ставок.",
    shocks: { rates_rub: 0.04, eq_moex: -0.1, credit_spread: 0.01, fx_rub: -0.06 },
    model: { underlying_shift: -0.1, volatility_shift: 0.18, rate_shift: 0.04 },
    source: "macro",
  },
];

const INTEGER_FORMATTER = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const MONEY_FORMATTER = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function emptyFactorRecord(): Record<MacroFactor, number> {
  return {
    fx_rub: 0,
    rates_rub: 0,
    eq_moex: 0,
    credit_spread: 0,
    vol_surface: 0,
    oil_brent: 0,
  };
}

function formatMoney(value: number, digits = 0): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatCompactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${MONEY_FORMATTER.format(Math.abs(value * 100))}%`;
}

function shortenLabel(value: string, max = 26): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1))}…`;
}

function normalizeSymbol(value: string | undefined | null): string {
  return String(value ?? "").toUpperCase().replace(/\s+/g, "");
}

function looksLikeFxPair(symbol: string): boolean {
  return /[A-Z]{3}\/?[A-Z]{3}/.test(symbol);
}

function positionDirection(position: PositionDTO): number {
  return position.quantity < 0 ? -1 : 1;
}

function positionExposure(position: PositionDTO): number {
  const notional = Number.isFinite(position.notional) ? Math.abs(position.notional) : 0;
  const quantity = Number.isFinite(position.quantity) ? Math.max(Math.abs(position.quantity), 1) : 1;
  return notional * quantity;
}

function formatPositionLabel(position: PositionDTO): string {
  const symbol = position.underlying_symbol?.trim();
  return symbol && symbol !== position.position_id
    ? `${position.position_id} · ${symbol}`
    : position.position_id;
}

function formatInstrumentType(type: PositionDTO["instrument_type"]): string {
  if (type === "swap_ir") return "IRS";
  if (type === "forward") return "Forward";
  return "Option";
}

function inferPositionSensitivities(position: PositionDTO, baseCurrency: string): Record<MacroFactor, number> {
  const symbol = normalizeSymbol(position.underlying_symbol);
  const currency = String(position.currency ?? "").toUpperCase();
  const isFx = looksLikeFxPair(symbol);
  const isOil = /(BRENT|WTI|OIL|URALS|GAZ|NG|BRN|CL)/.test(symbol);
  const isMoexEquity = /(MOEX|IMOEX|RTS|SBER|GAZP|LKOH|ROSN|GMKN|NVTK|TATN|MGNT|YNDX|VTBR)/.test(symbol);

  const sensitivities = emptyFactorRecord();

  if (position.instrument_type === "option") {
    sensitivities.eq_moex = position.option_type === "put" ? -0.58 : 0.66;
    sensitivities.vol_surface = 0.56;
    sensitivities.rates_rub = -0.05;
    if (isFx || (currency && currency !== baseCurrency)) {
      sensitivities.fx_rub = position.option_type === "put" ? 0.3 : -0.3;
    }
  }

  if (position.instrument_type === "forward") {
    sensitivities.eq_moex = isMoexEquity ? 0.52 : 0.1;
    sensitivities.fx_rub = isFx || (currency && currency !== baseCurrency) ? -0.92 : 0;
    sensitivities.rates_rub = 0.08;
  }

  if (position.instrument_type === "swap_ir") {
    sensitivities.rates_rub = -0.82;
    sensitivities.credit_spread = -0.24;
    sensitivities.fx_rub = currency && currency !== baseCurrency ? -0.08 : 0;
  }

  if (isMoexEquity && sensitivities.eq_moex === 0) sensitivities.eq_moex = 0.54;
  if (isOil) {
    sensitivities.oil_brent = 0.74;
    if (sensitivities.eq_moex === 0) sensitivities.eq_moex = 0.14;
  }
  if ((isFx || (currency && currency !== baseCurrency)) && sensitivities.fx_rub === 0) {
    sensitivities.fx_rub = -0.38;
  }

  return sensitivities;
}

function macroScenarioToDTO(scenario: ScenarioDescriptor): ScenarioDTO {
  return {
    scenario_id: scenario.id,
    description: scenario.name,
    underlying_shift: scenario.model.underlying_shift,
    volatility_shift: scenario.model.volatility_shift,
    rate_shift: scenario.model.rate_shift,
  };
}

function buildGenericScenarioDescriptor(dto: ScenarioDTO): ScenarioDescriptor {
  return {
    id: dto.scenario_id,
    name: dto.description?.trim() || dto.scenario_id.replaceAll("_", " "),
    short: shortenLabel(dto.description?.trim() || dto.scenario_id, 18),
    category: "Scenario",
    icon: "◌",
    description:
      dto.description?.trim()
      || `ΔS ${formatSignedPercent(dto.underlying_shift)} · ΔVol ${formatSignedPercent(dto.volatility_shift)} · Δr ${formatSignedPercent(dto.rate_shift)}`,
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

function buildScenarioInsight(scenario: ScenarioDescriptor, profiles: PositionProfile[]): ScenarioInsight {
  const factorPnl = emptyFactorRecord();
  let total = 0;
  let relevance = 0;

  const positions = profiles.map((profile) => {
    let pnl = 0;

    for (const factor of FACTOR_ORDER) {
      const shock = scenario.shocks[factor] ?? 0;
      const sensitivity = profile.sensitivities[factor] ?? 0;
      const contribution = profile.exposure * profile.direction * sensitivity * shock;
      pnl += contribution;
      factorPnl[factor] += contribution;
      relevance += Math.abs(contribution);
    }

    total += pnl;

    return {
      position_id: profile.position.position_id,
      label: profile.label,
      type: profile.position.instrument_type,
      pnl,
    };
  });

  return {
    id: scenario.id,
    scenario,
    relevance,
    pnl: total,
    factorPnl,
    positions,
  };
}

function ScenarioTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { fullName?: string; label?: string; note?: string; suffix?: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const meta = row.payload ?? {};

  return (
    <div className="stressTooltip">
      <div className="stressTooltipLabel">{meta.fullName ?? meta.label ?? "Сценарий"}</div>
      <div className="stressTooltipRow">
        <span className="stressTooltipDot" style={{ background: "rgba(125, 167, 255, 0.9)" }} />
        <span>{meta.note ?? "P&L"}</span>
        <strong>{formatMoney(Number(row.value ?? 0), 2)} {meta.suffix ?? "RUB"}</strong>
      </div>
    </div>
  );
}

function RadarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="stressTooltip">
      <div className="stressTooltipLabel">{label}</div>
      <div className="stressTooltipRow">
        <span className="stressTooltipDot" style={{ background: "rgba(125, 167, 255, 0.9)" }} />
        <span>Envelope</span>
        <strong>{formatMoney(Number(payload[0]?.value ?? 0), 1)}%</strong>
      </div>
    </div>
  );
}

export default function StressPage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { state: workflowState, dispatch: workflowDispatch } = useWorkflow();
  const metrics = dataState.results.metrics;
  const baseCurrency = String(workflowState.calcConfig.params?.baseCurrency ?? metrics?.base_currency ?? "RUB").toUpperCase();
  const portfolio = dataState.portfolio.positions;

  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());
  const [limitInput, setLimitInput] = useState("");
  const [activeChartId, setActiveChartId] = useState<ChartCardId>("stress_pnl");
  const [isDraggingStack, setIsDraggingStack] = useState(false);
  const selectionSeedRef = useRef<string>("");
  const stackPointerRef = useRef<{ pointerId: number | null; startX: number }>({
    pointerId: null,
    startX: 0,
  });

  const scenarioCatalog = useMemo(() => {
    const merged = new Map<string, ScenarioDescriptor>();

    for (const scenario of DEFAULT_STRESS_SCENARIOS) {
      merged.set(scenario.id, scenario);
    }

    for (const scenario of dataState.scenarios) {
      if (!merged.has(scenario.scenario_id)) {
        merged.set(scenario.scenario_id, buildGenericScenarioDescriptor(scenario));
      }
    }

    return Array.from(merged.values());
  }, [dataState.scenarios]);

  const positionProfiles = useMemo<PositionProfile[]>(() => {
    return portfolio.map((position) => ({
      position,
      label: formatPositionLabel(position),
      exposure: positionExposure(position),
      direction: positionDirection(position),
      sensitivities: inferPositionSensitivities(position, baseCurrency),
    }));
  }, [baseCurrency, portfolio]);

  const backendStressByScenario = useMemo(() => {
    return new Map((metrics?.stress ?? []).map((row) => [row.scenario_id, row]));
  }, [metrics?.stress]);

  const backendStressContributorsByScenario = useMemo(() => {
    const grouped = new Map<string, PositionImpactRow[]>();
    const positionsById = new Map(portfolio.map((position) => [position.position_id, position]));
    for (const row of metrics?.top_contributors?.stress ?? []) {
      const scenarioId = row.scenario_id;
      if (!scenarioId) continue;
      const position = positionsById.get(row.position_id);
      const rows = grouped.get(scenarioId) ?? [];
      rows.push({
        position_id: row.position_id,
        label: formatPositionLabel(position),
        type: position?.instrument_type ?? "forward",
        pnl: row.pnl_contribution,
      });
      grouped.set(scenarioId, rows);
    }
    return grouped;
  }, [metrics?.top_contributors?.stress, portfolio]);

  const rankedScenarioInsights = useMemo(() => {
    return scenarioCatalog
      .map((scenario) => {
        const sandboxInsight = buildScenarioInsight(scenario, positionProfiles);
        const backendStress = backendStressByScenario.get(scenario.id);
        if (!backendStress) return sandboxInsight;
        const backendContributors = backendStressContributorsByScenario.get(scenario.id);
        return {
          ...sandboxInsight,
          pnl: backendStress.pnl,
          relevance: Math.max(Math.abs(backendStress.pnl), sandboxInsight.relevance),
          positions: backendContributors?.length ? backendContributors : sandboxInsight.positions,
        };
      })
      .sort((left, right) => right.relevance - left.relevance);
  }, [backendStressByScenario, backendStressContributorsByScenario, positionProfiles, scenarioCatalog]);

  const autoLimitValue = useMemo(() => {
    const seededLimit = metrics?.stress?.find((row) => row.limit != null)?.limit;
    return seededLimit != null && Number.isFinite(seededLimit) ? Math.abs(seededLimit) : null;
  }, [metrics?.stress]);

  useEffect(() => {
    const seedKey = `${String(dataState.portfolio.importedAt ?? "none")}::${rankedScenarioInsights.map((item) => item.id).join(",")}`;
    if (selectionSeedRef.current === seedKey) return;

    const catalogIds = new Set(rankedScenarioInsights.map((item) => item.id));
    const storedIds = dataState.scenarios
      .map((scenario) => scenario.scenario_id)
      .filter((id) => catalogIds.has(id));
    const fallbackIds = rankedScenarioInsights.slice(0, 5).map((item) => item.id);
    const nextIds = storedIds.length ? storedIds : fallbackIds;
    const nextKey = [...nextIds].sort().join("|");

    setSelectedScenarioIds((previous) => {
      const previousKey = [...previous].sort().join("|");
      return previousKey === nextKey ? previous : new Set(nextIds);
    });
    selectionSeedRef.current = seedKey;
  }, [dataState.portfolio.importedAt, dataState.scenarios, rankedScenarioInsights]);

  const selectedInsights = useMemo(
    () => rankedScenarioInsights
      .filter((item) => selectedScenarioIds.has(item.id))
      .sort((left, right) => left.pnl - right.pnl),
    [rankedScenarioInsights, selectedScenarioIds]
  );

  const selectedScenarioDTOs = useMemo(
    () => selectedInsights.map((item) => macroScenarioToDTO(item.scenario)),
    [selectedInsights]
  );

  const selectedScenarioKey = useMemo(
    () => selectedScenarioDTOs.map((item) => item.scenario_id).sort().join("|"),
    [selectedScenarioDTOs]
  );

  const backendStressKey = useMemo(
    () => (metrics?.stress ?? []).map((item) => item.scenario_id).sort().join("|"),
    [metrics?.stress]
  );
  const sandboxStatus = !metrics
    ? "no_backend_run"
    : selectedScenarioKey && selectedScenarioKey === backendStressKey
      ? "synced_to_last_backend_run"
      : "sandbox_dirty";
  const stressSourceLabel = sandboxStatus === "synced_to_last_backend_run" ? "stress_source=backend_calculated" : "stress_source=frontend_sandbox_estimate";

  useEffect(() => {
    if (selectedScenarioDTOs.length) {
      workflowDispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Stress });
    }
  }, [selectedScenarioDTOs.length, workflowDispatch]);

  const limitValue = useMemo(() => {
    if (autoLimitValue != null) return autoLimitValue;
    const parsed = Number.parseFloat(limitInput.replace(/\s+/g, "").replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? Math.abs(parsed) : null;
  }, [autoLimitValue, limitInput]);

  const worstScenario = selectedInsights[0] ?? null;
  const bestScenario = selectedInsights[selectedInsights.length - 1] ?? null;

  const factorTotals = useMemo(() => {
    const totals = emptyFactorRecord();

    for (const insight of selectedInsights) {
      for (const factor of FACTOR_ORDER) {
        totals[factor] += insight.factorPnl[factor];
      }
    }

    const maxAbs = Math.max(...FACTOR_ORDER.map((factor) => Math.abs(totals[factor])), 1);

    return FACTOR_ORDER.map((factor) => {
      const value = totals[factor];
      const tone: FactorTone = value < 0 ? "negative" : value > 0 ? "positive" : "neutral";
      return {
        factor,
        label: FACTOR_LABELS[factor],
        value,
        tone,
        share: Math.abs(value) / maxAbs * 100,
      };
    });
  }, [selectedInsights]);

  const positionTotals = useMemo(() => {
    const totals = new Map<string, PositionImpactRow>();

    for (const profile of positionProfiles) {
      totals.set(profile.position.position_id, {
        position_id: profile.position.position_id,
        label: profile.label,
        type: profile.position.instrument_type,
        pnl: 0,
      });
    }

    for (const insight of selectedInsights) {
      for (const row of insight.positions) {
        const target = totals.get(row.position_id);
        if (!target) continue;
        target.pnl += row.pnl;
      }
    }

    return Array.from(totals.values()).sort((left, right) => Math.abs(right.pnl) - Math.abs(left.pnl));
  }, [positionProfiles, selectedInsights]);

  const scenarioBarData = useMemo(() => {
    return selectedInsights.map((item) => {
      const breached = limitValue != null && item.pnl < -Math.abs(limitValue);
      const fill = item.pnl > 0 ? "#6eff8e" : breached ? "#ff8f8f" : "#ffb86a";

      return {
        id: item.id,
        label: item.scenario.short,
        fullName: item.scenario.name,
        pnl: item.pnl,
        fill,
        note: "Сценарный P&L",
        suffix: baseCurrency,
      };
    });
  }, [baseCurrency, limitValue, selectedInsights]);

  const cumulativeStressData = useMemo(() => {
    let running = 0;
    return selectedInsights.map((item) => {
      running += item.pnl;
      return {
        label: item.scenario.short,
        fullName: item.scenario.name,
        value: running,
        note: "Накопленный P&L",
        suffix: baseCurrency,
      };
    });
  }, [baseCurrency, selectedInsights]);

  const breachStats = useMemo(() => {
    if (limitValue == null) {
      return { breachCount: 0, okCount: 0, breachShare: 0 };
    }

    const breachCount = selectedInsights.filter((item) => item.pnl < -Math.abs(limitValue)).length;
    const okCount = Math.max(selectedInsights.length - breachCount, 0);
    const breachShare = selectedInsights.length ? (breachCount / selectedInsights.length) * 100 : 0;
    return { breachCount, okCount, breachShare };
  }, [limitValue, selectedInsights]);

  const breachData = useMemo(() => {
    if (limitValue == null) return [];
    return [
      { name: "Breach", value: breachStats.breachCount, fill: "#ff8f8f" },
      { name: "OK", value: breachStats.okCount, fill: "#6eff8e" },
    ].filter((item) => item.value > 0);
  }, [breachStats.breachCount, breachStats.okCount, limitValue]);

  const envelopeRows = useMemo(() => {
    const rows = FACTOR_ORDER.map((factor) => {
      const value = selectedInsights.length
        ? Math.max(...selectedInsights.map((item) => Math.abs(item.scenario.shocks[factor] ?? 0))) * 100
        : 0;

      const tone: FactorTone = value > 20 ? "negative" : value > 5 ? "warning" : "positive";
      return {
        factor,
        label: FACTOR_LABELS[factor],
        value,
        tone,
      };
    });

    return rows.sort((left, right) => right.value - left.value);
  }, [selectedInsights]);

  const radarEnvelopeData = useMemo(() => {
    const lookup = new Map(envelopeRows.map((row) => [row.factor, row.value]));
    return FACTOR_ORDER.map((factor) => ({
      label: FACTOR_LABELS[factor],
      value: Number((lookup.get(factor) ?? 0).toFixed(1)),
    }));
  }, [envelopeRows]);

  const concentrationChartData = useMemo(() => {
    return positionTotals.map((row) => ({
      label: shortenLabel(row.label, 20),
      fullName: row.label,
      value: row.pnl,
      fill: row.pnl < 0 ? "#ff8f8f" : row.pnl > 0 ? "#6eff8e" : "#7da7ff",
      note: "Сумма оценок",
      suffix: baseCurrency,
    }));
  }, [baseCurrency, positionTotals]);

  const aggregateSelectedPnl = useMemo(() => {
    return selectedInsights.reduce((sum, insight) => sum + insight.pnl, 0);
  }, [selectedInsights]);

  const activeChartIndex = Math.max(0, CHART_CARDS.findIndex((item) => item.id === activeChartId));
  const hasPortfolio = portfolio.length > 0;
  const allSelected = hasPortfolio && selectedScenarioIds.size === rankedScenarioInsights.length;
  const defaultScenarioCount = Math.min(5, rankedScenarioInsights.length);

  const shiftChart = (direction: -1 | 1) => {
    const length = CHART_CARDS.length;
    const nextIndex = (activeChartIndex + direction + length) % length;
    const target = CHART_CARDS[nextIndex];
    if (target) setActiveChartId(target.id);
  };

  const relativeCardSlot = (index: number) => {
    const total = CHART_CARDS.length;
    const raw = (index - activeChartIndex + total) % total;
    return raw > total / 2 ? raw - total : raw;
  };

  const getCardStackStyle = (index: number): CSSProperties => {
    const slot = relativeCardSlot(index);
    const abs = Math.abs(slot);
    const hidden = abs > 2;

    if (slot === 0) {
      return {
        transform: "translateX(0%) scale(1)",
        opacity: 1,
        zIndex: 6,
        filter: "brightness(1) saturate(1)",
        pointerEvents: "auto",
      };
    }

    if (hidden) {
      return {
        transform: `translateX(${slot > 0 ? 52 : -52}%) scale(0.88)`,
        opacity: 0,
        zIndex: 1,
        filter: "brightness(0.5) saturate(0.78)",
        pointerEvents: "none",
      };
    }

    const translateX = slot > 0 ? (abs === 1 ? 18 : 34) : abs === 1 ? -18 : -34;
    const scale = abs === 1 ? 0.95 : 0.91;
    const opacity = abs === 1 ? 0.62 : 0.28;

    return {
      transform: `translateX(${translateX}%) scale(${scale})`,
      opacity,
      zIndex: abs === 1 ? 5 : 4,
      filter: "brightness(0.62) saturate(0.85)",
      pointerEvents: abs <= 1 ? "auto" : "none",
    };
  };

  const handleStackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    stackPointerRef.current = { pointerId: event.pointerId, startX: event.clientX };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDraggingStack(true);
  };

  const handleStackPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stackPointerRef.current.pointerId !== event.pointerId) return;
    const delta = event.clientX - stackPointerRef.current.startX;
    stackPointerRef.current = { pointerId: null, startX: 0 };
    setIsDraggingStack(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (Math.abs(delta) < 56) return;
    if (delta < 0) shiftChart(1);
    else shiftChart(-1);
  };

  const handleStackPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stackPointerRef.current.pointerId !== event.pointerId) return;
    stackPointerRef.current = { pointerId: null, startX: 0 };
    setIsDraggingStack(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const renderChartCard = (cardId: ChartCardId) => {
    if (cardId === "stress_pnl") {
      return (
        <>
          <div className="stressPanelHeader">
            <div>
              <div className="stressPanelTitle">Stress P&amp;L по сценариям</div>
              <div className="stressPanelSub">Выбранные сценарии отсортированы от худшего исхода к лучшему.</div>
            </div>
          </div>

          {scenarioBarData.length ? (
            <div className="stressChartWrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioBarData} margin={{ top: 10, right: 20, bottom: 24, left: 8 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "rgba(244,241,234,0.58)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatCompactMoney} tick={{ fill: "rgba(244,241,234,0.58)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
                  {limitValue != null ? (
                    <ReferenceLine
                      y={-Math.abs(limitValue)}
                      stroke="#ff8f8f"
                      strokeDasharray="6 4"
                      label={{
                        value: `Лимит: -${INTEGER_FORMATTER.format(Math.abs(limitValue))}`,
                        position: "insideTopRight",
                        fill: "#ff8f8f",
                        fontSize: 10,
                      }}
                    />
                  ) : null}
                  <Tooltip content={<ScenarioTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="pnl" radius={[12, 12, 0, 0]} maxBarSize={50}>
                    {scenarioBarData.map((row) => (
                      <Cell key={row.id} fill={row.fill} fillOpacity={0.92} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="stressEmptyState">Выберите сценарии, чтобы построить Stress P&amp;L.</div>
          )}
        </>
      );
    }

    if (cardId === "cumulative") {
      return (
        <>
          <div className="stressPanelHeader">
            <div>
              <div className="stressPanelTitle">Кумулятивный стресс</div>
              <div className="stressPanelSub">Накопленный P&amp;L при последовательном наложении сценариев от худшего к лучшему.</div>
            </div>
          </div>

          {cumulativeStressData.length ? (
            <div className="stressChartWrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeStressData} margin={{ top: 10, right: 20, bottom: 18, left: 8 }}>
                  <defs>
                    <linearGradient id="stressCumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7da7ff" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="#7da7ff" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "rgba(244,241,234,0.58)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatCompactMoney} tick={{ fill: "rgba(244,241,234,0.58)", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
                  <Tooltip content={<ScenarioTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#7da7ff"
                    strokeWidth={2.3}
                    fill="url(#stressCumulativeGradient)"
                    dot={{ r: 3, stroke: "#7da7ff", strokeWidth: 2, fill: "rgba(10,12,18,0.98)" }}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="stressEmptyState">Кумулятивный стресс появится после выбора хотя бы одного сценария.</div>
          )}
        </>
      );
    }

    if (cardId === "breach") {
      return (
        <>
          <div className="stressPanelHeader">
            <div>
              <div className="stressPanelTitle">Breach Share</div>
              <div className="stressPanelSub">Соотношение сценариев, которые превышают заданный лимит.</div>
            </div>
          </div>

          {limitValue == null ? (
            <div className="stressEmptyState">
              Задайте лимит в шапке страницы.
              <br />
              После этого donut покажет долю сценариев с breach.
            </div>
          ) : !selectedInsights.length ? (
            <div className="stressEmptyState">Нет выбранных сценариев для расчёта breach share.</div>
          ) : (
            <div className="stressBreachLayout">
              <div className="stressBreachDonut">
                <div className="stressBreachDonutFigure">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={breachData} dataKey="value" innerRadius={58} outerRadius={86} stroke="none" startAngle={90} endAngle={-270}>
                        {breachData.map((row) => (
                          <Cell key={row.name} fill={row.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="stressBreachDonutCenter">
                    <strong>{breachStats.breachShare.toFixed(0)}%</strong>
                    <span>breach</span>
                  </div>
                </div>
              </div>

              <div className="stressBreachLegend">
                <div className="stressLegendRow">
                  <span className="stressLegendDot" style={{ background: "#ff8f8f" }} />
                  <div>
                    <strong>{breachStats.breachCount}</strong>
                    <span>Превышают лимит</span>
                  </div>
                </div>
                <div className="stressLegendRow">
                  <span className="stressLegendDot" style={{ background: "#6eff8e" }} />
                  <div>
                    <strong>{breachStats.okCount}</strong>
                    <span>Ниже текущего порога</span>
                  </div>
                </div>
                <div className="stressLegendInfo">
                  <span>Текущий порог</span>
                  <strong>{INTEGER_FORMATTER.format(limitValue)} RUB</strong>
                </div>
              </div>
            </div>
          )}
        </>
      );
    }

    if (cardId === "factor_profile") {
      return (
        <>
          <div className="stressPanelHeader">
            <div>
              <div className="stressPanelTitle">Факторный профиль</div>
              <div className="stressPanelSub">Envelope: максимальный шок по каждому фактору среди всех выбранных сценариев.</div>
            </div>
          </div>

          {selectedInsights.length ? (
            <div className="stressFactorProfileLayout">
              <div className="stressFactorProfileChart">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarEnvelopeData} outerRadius="70%">
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="label" tick={{ fill: "rgba(244,241,234,0.62)", fontSize: 10 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} domain={[0, Math.max(...radarEnvelopeData.map((row) => row.value), 20)]} />
                    <Tooltip content={<RadarTooltip />} />
                    <Radar
                      name="Envelope"
                      dataKey="value"
                      stroke="#7da7ff"
                      fill="#7da7ff"
                      fillOpacity={0.18}
                      strokeWidth={2.2}
                      dot={{ r: 3, fill: "#7da7ff", strokeWidth: 0 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="stressFactorProfileTable">
                {envelopeRows.map((row) => (
                  <div key={row.factor} className="stressFactorProfileRow">
                    <span>{row.label}</span>
                    <strong className={`stressFactorProfileValue stressFactorProfileValue--${row.tone}`}>
                      {formatMoney(row.value, 1)}%
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="stressEmptyState">Выберите сценарии, чтобы увидеть envelope по факторам.</div>
          )}
        </>
      );
    }

    return (
      <>
        <div className="stressPanelHeader">
          <div>
            <div className="stressPanelTitle">Концентрация по позициям</div>
            <div className="stressPanelSub">Суммарный P&amp;L каждой позиции через весь выбранный набор сценариев.</div>
          </div>
        </div>

        {concentrationChartData.length && selectedInsights.length ? (
          <div className="stressChartWrap" style={{ height: `${Math.max(300, concentrationChartData.length * 44)}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={concentrationChartData} layout="vertical" margin={{ top: 8, right: 18, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCompactMoney} tick={{ fill: "rgba(244,241,234,0.58)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fill: "rgba(244,241,234,0.62)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <ReferenceLine x={0} stroke="rgba(255,255,255,0.18)" />
                <Tooltip content={<ScenarioTooltip />} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]} maxBarSize={28}>
                  {concentrationChartData.map((row) => (
                    <Cell key={row.fullName} fill={row.fill} fillOpacity={0.92} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="stressEmptyState">Позиционный профиль появится после выбора сценариев.</div>
        )}
      </>
    );
  };

  if (!hasPortfolio) {
    return (
      <div className="importPagePlain stressPage">
        <Card className="marketTabsCard">
          <div className="marketBoardTitle">Портфель ещё не загружен</div>
          <div className="marketBoardSub">
            Загрузите позиции на шаге импорта, и после этого страница автоматически подберёт самые опасные макро-сценарии под ваш портфель.
          </div>
          <div className="runActionRow">
            <Button onClick={() => nav("/import")}>К импорту</Button>
            <Button variant="secondary" onClick={() => nav("/configure")}>К конфигурации</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="importPagePlain stressPage">
      <div className="importHeroRow stressHeroRow">
        <div className="stressHeroCopy">
          <span className="importFileTag">Stress Testing</span>
          <h1 className="pageTitle">Стресс-сценарии</h1>
          <p className="stressHeroSub">
            {sandboxStatus === "synced_to_last_backend_run"
              ? "Выбранные сценарии совпадают с последним backend run; P&L берётся из backend metrics."
              : "Преднастроенные макро-шоки оценены на frontend как индикативный sandbox для текущего портфеля."}
          </p>
        </div>

        <div className="stressHeroActions">
          {autoLimitValue != null ? (
            <div className="stressAutoLimitBadge">
              <span>Лимит (авто)</span>
              <strong>{formatMoney(autoLimitValue, 0)} {baseCurrency}</strong>
            </div>
          ) : (
            <label className="stressLimitField">
              <span>Лимит, RUB</span>
              <input
                type="number"
                inputMode="numeric"
                placeholder="Например, 2500000"
                value={limitInput}
                onChange={(event) => setLimitInput(event.target.value)}
              />
            </label>
          )}

          <Chip color="primary" variant="flat" radius="sm" className="stressCountChip">
            {selectedScenarioIds.size} сценариев выбрано
          </Chip>
          <Chip color={sandboxStatus === "synced_to_last_backend_run" ? "success" : "warning"} variant="flat" radius="sm" className="stressCountChip">
            {stressSourceLabel}
          </Chip>
        </div>
      </div>

      <Reveal>
        <div className="stressSplitLayout">
          <Card className="marketTabsCard stressPanelCard stressPanelCard--catalog">
            <div className="stressPanelHeader stressPanelHeader--sticky">
              <div>
                <div className="stressPanelTitle">Каталог сценариев</div>
                <div className="stressPanelSub">Ранжировано по влиянию на ваш портфель</div>
              </div>

              <Button
                variant="ghost"
                onClick={() => {
                  if (allSelected) {
                    setSelectedScenarioIds(new Set());
                    return;
                  }
                  setSelectedScenarioIds(new Set(rankedScenarioInsights.map((item) => item.id)));
                }}
              >
                {allSelected ? "Снять все" : "Выбрать все"}
              </Button>
            </div>

            <div className="stressPanelScroller stressCatalogList">
              {rankedScenarioInsights.map((insight, index) => {
                const selected = selectedScenarioIds.has(insight.id);
                const relevanceShare = rankedScenarioInsights[0]?.relevance
                  ? insight.relevance / rankedScenarioInsights[0].relevance * 100
                  : 0;
                const accent = CATEGORY_COLORS[insight.scenario.category] ?? CATEGORY_COLORS.Scenario;
                const cardStyle = { "--stress-accent": accent } as CSSProperties;

                return (
                  <button
                    key={insight.id}
                    type="button"
                    className={`stressCatalogRow ${selected ? "stressCatalogRow--selected" : ""}`}
                    onClick={() => {
                      setSelectedScenarioIds((previous) => {
                        const next = new Set(previous);
                        if (next.has(insight.id)) next.delete(insight.id);
                        else next.add(insight.id);
                        return next;
                      });
                    }}
                    style={cardStyle}
                    aria-pressed={selected}
                  >
                    <div className="stressCatalogRowTop">
                      <div className="stressCatalogRowLead">
                        <span className={`stressCheckbox ${selected ? "stressCheckbox--checked" : ""}`} aria-hidden="true">
                          {selected ? "✓" : ""}
                        </span>
                        <span className="stressCatalogIcon" aria-hidden="true">{insight.scenario.icon}</span>

                        <div className="stressCatalogCopy">
                          <div className="stressCatalogTitleRow">
                            <strong>{insight.scenario.short}</strong>
                            <span className="stressCatalogFullName">{insight.scenario.name}</span>
                          </div>
                          <div className="stressCatalogMetaRow">
                            <span className="stressCatalogTag">{insight.scenario.category}</span>
                            <span className="stressCatalogRank">#{index + 1}</span>
                          </div>
                        </div>
                      </div>

                      {selected ? (
                        <div className={`stressCatalogPnl ${insight.pnl < 0 ? "stressCatalogPnl--neg" : insight.pnl > 0 ? "stressCatalogPnl--pos" : ""}`}>
                          {formatMoney(insight.pnl, 0)}
                        </div>
                      ) : null}
                    </div>

                    <div className="stressCatalogDescription" title={insight.scenario.description}>
                      {insight.scenario.description}
                    </div>

                    <div className="stressCatalogRelevance">
                      <div className="stressCatalogRelevanceHead">
                        <span>Релевантность</span>
                        <span>{relevanceShare.toFixed(0)}%</span>
                      </div>
                      <div className="stressCatalogRelevanceTrack">
                        <div className="stressCatalogRelevanceFill" style={{ width: `${relevanceShare}%` }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="stressPanelFooterHint">
              {sandboxStatus === "synced_to_last_backend_run"
                ? "Выбраны сценарии последнего backend run; значения P&L синхронизированы с backend metrics."
                : `По умолчанию выбраны top-${defaultScenarioCount} сценариев по локальному relevance score. Изменение обновляет только sandbox-оценку и не перезаписывает backend metrics.`}
            </div>
          </Card>

          <Card className="marketTabsCard stressPanelCard stressPanelCard--live">
            <div className="stressPanelHeader stressPanelHeader--sticky">
              <div>
                <div className="stressLiveTitleRow">
                  <div className="stressLiveDot" aria-hidden="true" />
                  <div className="stressPanelTitle">{sandboxStatus === "synced_to_last_backend_run" ? "Backend stress P&L" : "Индикативная оценка портфеля"}</div>
                  <span className="stressLiveBadge">{sandboxStatus === "synced_to_last_backend_run" ? "Backend" : "Estimate"}</span>
                </div>
                <div className="stressPanelSub">
                  {sandboxStatus === "synced_to_last_backend_run"
                    ? `Выбрано сценариев: ${selectedScenarioIds.size}. Значения совпадают с последним backend run.`
                    : `Выбрано сценариев: ${selectedScenarioIds.size}. Это frontend sandbox, не новый backend run.`}
                </div>
              </div>
            </div>

            {!selectedInsights.length ? (
              <div className="stressPanelScroller">
                <div className="stressEmptyState">
                  Пока не выбран ни один сценарий.
                  <br />
                  Отметьте один или несколько сценариев в каталоге слева.
                </div>
              </div>
            ) : (
              <div className="stressPanelScroller stressLiveScroller">
                <div className="stressLiveOverviewGrid">
                  <div className="stressLiveMetric stressLiveMetric--primary">
                    <span>Сумма оценок по выбранным сценариям</span>
                    <strong className={aggregateSelectedPnl < 0 ? "stressLiveMetric__negative" : aggregateSelectedPnl > 0 ? "stressLiveMetric__positive" : ""}>
                      {formatMoney(aggregateSelectedPnl, 0)} {baseCurrency}
                    </strong>
                    <small>
                      {limitValue == null
                        ? "Лимит не задан"
                        : `Breach: ${breachStats.breachCount} из ${selectedInsights.length}`}
                    </small>
                  </div>

                  <div className="stressLiveMetric">
                    <span>Худший сценарий</span>
                    <strong className="stressLiveMetric__negative">{worstScenario ? formatMoney(worstScenario.pnl, 0) : "—"}</strong>
                    <small>{worstScenario?.scenario.short ?? "Нет данных"}</small>
                  </div>

                  <div className="stressLiveMetric">
                    <span>Лучший сценарий</span>
                    <strong className={bestScenario && bestScenario.pnl >= 0 ? "stressLiveMetric__positive" : ""}>
                      {bestScenario ? formatMoney(bestScenario.pnl, 0) : "—"}
                    </strong>
                    <small>{bestScenario?.scenario.short ?? "Нет данных"}</small>
                  </div>
                </div>

                <div className="stressLiveSection">
                  <div className="stressLiveSectionTitle">Воздействие по факторам</div>

                  <div className="stressFactorAggregateList">
                    {factorTotals.map((row) => (
                      <div key={row.factor} className="stressFactorAggregateRow">
                        <div className="stressFactorAggregateHead">
                          <span>{row.label}</span>
                          <strong className={`stressFactorAggregateValue stressFactorAggregateValue--${row.tone}`}>
                            {formatMoney(row.value, 0)}
                          </strong>
                        </div>
                        <div className="stressFactorAggregateTrack">
                          <div
                            className={`stressFactorAggregateFill stressFactorAggregateFill--${row.tone}`}
                            style={{ width: `${row.share ? Math.max(4, row.share) : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stressLiveSection">
                  <div className="stressLiveSectionTitle">Позиции портфеля</div>

                  <div className="stressPositionList">
                    {positionTotals.map((row) => (
                      <div key={row.position_id} className="stressPositionRow">
                        <span className={`stressPositionStrip ${row.pnl < 0 ? "stressPositionStrip--neg" : row.pnl > 0 ? "stressPositionStrip--pos" : ""}`} />
                        <div className="stressPositionCopy">
                          <strong>{row.label}</strong>
                          <span>{formatInstrumentType(row.type)}</span>
                        </div>
                        <div className={`stressPositionValue ${row.pnl < 0 ? "stressPositionValue--neg" : row.pnl > 0 ? "stressPositionValue--pos" : ""}`}>
                          {formatMoney(row.pnl, 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </Reveal>

      <Reveal delay={0.08}>
        <div className="stressAnalyticsEyebrow">Аналитика</div>

        <Card className="marketTabsCard stressCarouselShell">
          <div className="stressCarouselHeader">
            <div>
              <div className="stressPanelTitle">Карточки стресс-профиля</div>
              <div className="stressPanelSub">Активная карточка всегда сверху: при переключении уходит влево и затемняется, следующая выходит на передний план.</div>
            </div>

            <div className="stressCarouselArrows">
              <Button variant="ghost" onClick={() => shiftChart(-1)}>‹</Button>
              <Button variant="ghost" onClick={() => shiftChart(1)}>›</Button>
            </div>
          </div>

          <div
            className={`stressCarouselViewport ${isDraggingStack ? "stressCarouselViewport--dragging" : ""}`}
            onPointerDown={handleStackPointerDown}
            onPointerUp={handleStackPointerUp}
            onPointerCancel={handleStackPointerCancel}
          >
            <div className="stressCarouselStack">
              {CHART_CARDS.map((card, index) => {
                const isActive = card.id === activeChartId;
                return (
                  <section
                    key={card.id}
                    className={`stressCarouselCard ${isActive ? "stressCarouselCard--active" : "stressCarouselCard--layer"}`}
                    style={getCardStackStyle(index)}
                    aria-hidden={!isActive}
                    onClick={() => setActiveChartId(card.id)}
                  >
                    {renderChartCard(card.id)}
                  </section>
                );
              })}
            </div>
          </div>

          <div className="stressCarouselDots" role="tablist" aria-label="Карточки аналитики">
            {CHART_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                role="tab"
                aria-selected={activeChartId === card.id}
                className={`stressCarouselDot ${activeChartId === card.id ? "stressCarouselDot--active" : ""}`}
                onClick={() => setActiveChartId(card.id)}
                aria-label={card.label}
              />
            ))}
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
