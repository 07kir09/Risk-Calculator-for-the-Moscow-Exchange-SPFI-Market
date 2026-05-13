import { Key, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  Chip,
  Checkbox,
  CheckboxGroup,
  Description,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Select,
  Slider,
  TextArea,
  Tooltip,
  toast,
} from "@heroui/react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import { Reveal } from "../components/rich/RichVisuals";
import { fetchScenarioCatalog, syncLiveMarketData } from "../api/endpoints";
import { useAppData } from "../state/appDataStore";
import { demoScenarios } from "../mock/demoData";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { runRiskCalculation } from "../api/services/risk";
import { ScenarioDTO } from "../api/contracts/metrics";
import { applyAutoLimits, isDemoDefaultLimits } from "../lib/autoLimits";
import { attachMethodologyMetadata } from "../lib/methodology";

type MetricKey =
  | "var_hist"
  | "var_param"
  | "es_hist"
  | "es_param"
  | "lc_var"
  | "greeks"
  | "stress"
  | "correlations";

type MetricCard = {
  key: MetricKey;
  title: string;
  summary: string;
  tags: string[];
  tooltip: {
    what: string;
    purpose: string;
    calculates: string;
  };
};

const metricCards: MetricCard[] = [
  {
    key: "var_hist",
    title: "Scenario VaR",
    summary: "VaR по доступному набору сценариев для оценки хвостового убытка.",
    tags: ["сценарный", "квантиль"],
    tooltip: {
      what: "Метрика показывает пороговый убыток по доступному набору сценариев; это не полная историческая выборка рынка.",
      purpose: "Нужна для базовой оценки рыночного риска и для разговора с пользователем в формате «сколько можно потерять при обычном стрессовом дне».",
      calculates: "Считает квантиль распределения PnL по сценарным наблюдениям на выбранном уровне доверия.",
    },
  },
  {
    key: "var_param",
    title: "VaR (параметрический)",
    summary: "Быстрый VaR на базе волатильности, корреляций и tail-модели.",
    tags: ["параметрический", "быстро"],
    tooltip: {
      what: "Это оценка VaR не по набору сценариев, а по предположению о форме распределения доходностей и взаимосвязях факторов риска.",
      purpose: "Полезна, когда нужен быстрый и стабильный расчёт или сравнение с историческим VaR по той же конфигурации.",
      calculates: "Считает порог убытка через параметры распределения, волатильности, корреляции и выбранную tail-модель.",
    },
  },
  {
    key: "es_hist",
    title: "ES (сценарный)",
    summary: "Показывает средний убыток внутри худшего хвоста сценарного распределения.",
    tags: ["tail-risk", "сценарный"],
    tooltip: {
      what: "Expected Shortfall дополняет VaR: вместо одного порога он показывает, насколько плохими в среднем бывают уже самые плохие сценарии.",
      purpose: "Нужна, когда VaR слишком «сухой» и хочется понять глубину хвостового риска, а не только точку отсечения.",
      calculates: "Считает средний PnL в худшей части сценарного распределения, лежащей за выбранным уровнем доверия.",
    },
  },
  {
    key: "es_param",
    title: "ES (параметрический)",
    summary: "Параметрический Expected Shortfall для более гладкой оценки хвоста.",
    tags: ["параметрический", "tail-risk"],
    tooltip: {
      what: "Это параметрический аналог ES: глубина хвоста оценивается не по дискретным сценариям, а по модели распределения.",
      purpose: "Полезна для сравнения с историческим ES и для случаев, где нужна согласованная модельная оценка хвоста.",
      calculates: "Считает средний ожидаемый убыток в хвосте распределения на основе параметров риска и tail-модели.",
    },
  },
  {
    key: "lc_var",
    title: "LC VaR",
    summary: "VaR с поправкой на ликвидность и сложность выхода из позиции.",
    tags: ["ликвидность", "надбавка"],
    tooltip: {
      what: "LC VaR расширяет обычный VaR, добавляя риск того, что крупную или неликвидную позицию нельзя быстро закрыть без дополнительного убытка.",
      purpose: "Нужна для реалистичной оценки риска портфеля, где важен не только рыночный шок, но и цена выхода из позиции.",
      calculates: "Считает VaR и добавляет надбавку за ликвидность по выбранной модели ликвидности и размеру позиций.",
    },
  },
  {
    key: "greeks",
    title: "Чувствительности",
    summary: "Delta, gamma, vega, theta, rho и DV01 по портфелю и позициям.",
    tags: ["экспозиции", "хедж"],
    tooltip: {
      what: "Это набор производных чувствительностей, которые показывают, как меняется стоимость портфеля при малом сдвиге факторов риска.",
      purpose: "Нужны для хеджа, объяснения источников риска и быстрой диагностики, что именно двигает PnL.",
      calculates: "Считает суммарные и позиционные чувствительности к цене, волатильности, времени, ставке и кривой доходности.",
    },
  },
  {
    key: "stress",
    title: "Стресс-сценарии",
    summary: "Итоговый PnL при заранее заданных сильных шоках рынка.",
    tags: ["сценарии", "шоки"],
    tooltip: {
      what: "Метрика показывает, как портфель ведёт себя не в «обычном хвосте», а в заранее заданных резких движениях рынка.",
      purpose: "Нужна для понятного пользовательского ответа на вопрос «что будет, если рынок резко сдвинется вот так».",
      calculates: "Считает PnL и вклад позиций для каждого стресс-сценария из выбранного набора шоков.",
    },
  },
  {
    key: "correlations",
    title: "Корреляции",
    summary: "Матрица связей между ключевыми факторами риска в портфеле.",
    tags: ["связи", "диверсификация"],
    tooltip: {
      what: "Корреляции показывают, какие факторы риска обычно двигаются вместе, а какие дают диверсификацию.",
      purpose: "Нужны для объяснения агрегированного риска и для проверки, за счёт чего портфель реально диверсифицирован.",
      calculates: "Считает матрицу корреляций между факторами риска или сериями изменений, используемыми в модели.",
    },
  },
];

const baseMetricSet: MetricKey[] = ["var_hist", "es_hist", "lc_var", "greeks", "stress"];
const allowedMetricKeys = new Set<MetricKey>(metricCards.map((metric) => metric.key));

const viteEnv = ((import.meta as any).env ?? {}) as Record<string, any>;
const defaultDemoMode = (globalThis as any).process?.env?.NODE_ENV === "test" ? "1" : "0";
const demoMode = (viteEnv.VITE_DEMO_MODE ?? defaultDemoMode) === "1";

const apiScenarioFallback: ScenarioDTO[] = [
  { scenario_id: "base", underlying_shift: 0.0, volatility_shift: 0.0, rate_shift: 0.0, fx_spot_shifts: { USD: 0.0, EUR: 0.0, CNY: 0.0 } },
  { scenario_id: "rates_parallel_up", underlying_shift: -0.02, volatility_shift: 0.02, rate_shift: 0.01, fx_spot_shifts: { USD: 0.0, EUR: 0.0, CNY: 0.0 } },
  { scenario_id: "rates_parallel_down", underlying_shift: 0.02, volatility_shift: -0.01, rate_shift: -0.01, fx_spot_shifts: { USD: 0.0, EUR: 0.0, CNY: 0.0 } },
  { scenario_id: "rub_selloff_fx_up", underlying_shift: -0.04, volatility_shift: 0.06, rate_shift: 0.0025, fx_spot_shifts: { USD: 0.08, EUR: 0.08, CNY: 0.06 } },
  { scenario_id: "rub_rally_fx_down", underlying_shift: 0.03, volatility_shift: -0.03, rate_shift: -0.0025, fx_spot_shifts: { USD: -0.05, EUR: -0.05, CNY: -0.04 } },
  { scenario_id: "combined_risk_off", underlying_shift: -0.08, volatility_shift: 0.12, rate_shift: 0.015, fx_spot_shifts: { USD: 0.12, EUR: 0.12, CNY: 0.09 } },
  { scenario_id: "mild_risk_off", underlying_shift: -0.03, volatility_shift: 0.05, rate_shift: 0.005, fx_spot_shifts: { USD: 0.04, EUR: 0.04, CNY: 0.03 } },
];

function isLegacyDemoScenarioSet(scenarios: ScenarioDTO[]) {
  const legacyIds = new Set([
    ...demoScenarios.map((scenario) => scenario.scenario_id),
    "shock_0",
    "shock_1",
    "shock_2",
    "shock_3",
    "shock_4",
    "shock_5",
    "shock_6",
  ]);
  return scenarios.every((scenario) => legacyIds.has(scenario.scenario_id));
}

function hasRatesOrFxScenarios(scenarios: ScenarioDTO[]) {
  return scenarios.some((scenario) =>
    Number(scenario.rate_shift ?? 0) !== 0 ||
      Object.keys(scenario.curve_shifts ?? {}).length > 0 ||
      Object.entries(scenario.fx_spot_shifts ?? {}).some(([, value]) => Number(value) !== 0)
  );
}

function shouldRefreshApiScenarios(scenarios: ScenarioDTO[]) {
  return !scenarios.length || isLegacyDemoScenarioSet(scenarios) || !hasRatesOrFxScenarios(scenarios);
}

function normalizeFxPair(value: string) {
  const clean = String(value ?? "").trim().toUpperCase().replace(/[-_]/g, "/");
  const compact = clean.replace(/[^A-Z]/g, "");
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(clean)) return clean;
  if (/^[A-Z]{6}$/.test(compact)) return `${compact.slice(0, 3)}/${compact.slice(3)}`;
  return clean;
}

function hasFxPair(availablePairs: Set<string>, fromCurrency: string, toCurrency: string) {
  const direct = `${fromCurrency}/${toCurrency}`;
  const inverse = `${toCurrency}/${fromCurrency}`;
  return availablePairs.has(direct) || availablePairs.has(inverse);
}

function extractFxPairsFromError(message: string) {
  const pairs = new Set<string>();
  for (const match of message.matchAll(/\b([A-Z]{3})\/([A-Z]{3})\b/g)) {
    const left = match[1]?.toUpperCase();
    const right = match[2]?.toUpperCase();
    if (left && right) pairs.add(`${left}/${right}`);
  }
  return Array.from(pairs).sort();
}

const metricGlyphByKey: Record<MetricKey, string> = {
  var_hist: "VH",
  var_param: "VP",
  es_hist: "EH",
  es_param: "EP",
  lc_var: "LC",
  greeks: "GR",
  stress: "ST",
  correlations: "CR",
};

function ParamInfo({ text, title }: { text: string; title: string }) {
  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger aria-label={`More information: ${title}`}>
        <div className="configureParamInfoTrigger">
          <span className="configureParamInfoGlyph" aria-hidden="true">?</span>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content className="configureParamTooltip" showArrow placement="top" offset={4}>
        <Tooltip.Arrow className="configureParamTooltipArrow" />
        <div className="configureParamTooltipInner">
          <p className="configureParamTooltipTitle">More information</p>
          <p className="configureParamTooltipText">
            <strong>{title}:</strong> {text}
          </p>
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}

export default function ConfigurePage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();

  const [selected, setSelected] = useState<MetricKey[]>(() => {
    const current = (wf.calcConfig.selectedMetrics as MetricKey[]) ?? [];
    const filtered = current.filter((metric): metric is MetricKey => allowedMetricKeys.has(metric));
    return filtered.length ? filtered : baseMetricSet;
  });
  const [alpha, setAlpha] = useState<number>(() => Number(wf.calcConfig.params?.alpha ?? 0.99));
  const [horizonDays, setHorizonDays] = useState<number>(() => Number(wf.calcConfig.params?.horizonDays ?? 10));
  const [parametricTailModel, setParametricTailModel] = useState<string>(() => String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher"));
  const [historyDays, setHistoryDays] = useState<number>(() => Number(wf.calcConfig.params?.historyDays ?? 250));
  const [baseCurrency, setBaseCurrency] = useState<string>(() => String(wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase());
  const [liquidityModel, setLiquidityModel] = useState<string>(() => String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value"));
  const [alphaBand, setAlphaBand] = useState<[number, number]>(() => [95, 99]);
  const [isRunning, setIsRunning] = useState(false);
  const [liveSyncLoading, setLiveSyncLoading] = useState(false);
  const liveSyncAttemptedRef = useRef(false);
  const [fxRatesText, setFxRatesText] = useState<string>(() => {
    const raw = wf.calcConfig.params?.fxRates;
    if (!raw || typeof raw !== "object") return "{}";
    return JSON.stringify(raw, null, 2);
  });

  useEffect(() => {
    let cancelled = false;

    if (demoMode) {
      if (!dataState.scenarios.length) {
        dataDispatch({ type: "SET_SCENARIOS", scenarios: demoScenarios });
      }
      return () => { cancelled = true; };
    }

    if (!shouldRefreshApiScenarios(dataState.scenarios)) {
      return () => { cancelled = true; };
    }

    fetchScenarioCatalog()
      .then((scenarios) => {
        if (cancelled) return;
        dataDispatch({ type: "SET_SCENARIOS", scenarios: scenarios.length ? scenarios : apiScenarioFallback });
      })
      .catch(() => {
        if (cancelled) return;
        dataDispatch({ type: "SET_SCENARIOS", scenarios: apiScenarioFallback });
      });

    return () => { cancelled = true; };
  }, [dataDispatch, dataState.scenarios]);

  const fxRatesResult = useMemo(() => {
    const text = fxRatesText.trim();
    if (!text) return { value: undefined as Record<string, number> | undefined, error: "" };
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { value: undefined, error: "FX rates должен быть JSON-объектом вида {\"USD\": 90.5}" };
      }
      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          return { value: undefined, error: `Неверный FX для ${key}: ожидается положительное число` };
        }
        out[String(key).toUpperCase()] = numeric;
      }
      return { value: out, error: "" };
    } catch {
      return { value: undefined, error: "Некорректный JSON в FX rates" };
    }
  }, [fxRatesText]);

  const marketMode = dataState.marketDataMode ?? "api_auto";
  const apiAutoMode = marketMode === "api_auto";
  const liveMarketReady = Boolean(
    apiAutoMode &&
      dataState.marketDataSummary?.ready &&
      dataState.marketDataSummary.blocking_errors === 0 &&
      dataState.marketDataSummary.missing_required_files.length === 0 &&
      dataState.marketDataSummary.session_id
  );

  const missingFxCurrencies = useMemo(() => {
    const base = baseCurrency.toUpperCase();
    const provided = fxRatesResult.value ?? {};
    const marketFxPairs = new Set((dataState.marketDataSummary?.available_fx_pairs ?? []).map(normalizeFxPair));
    return Array.from(
      new Set(
        dataState.portfolio.positions
          .map((position) => String(position.currency ?? "").toUpperCase())
          .filter((currency) =>
            currency &&
            currency !== base &&
            !Number.isFinite(Number(provided[currency])) &&
            !hasFxPair(marketFxPairs, currency, base)
          )
      )
    ).sort();
  }, [baseCurrency, dataState.marketDataSummary?.available_fx_pairs, dataState.portfolio.positions, fxRatesResult.value]);
  const missingFxRequiresManualInput = missingFxCurrencies.length > 0;

  const handleSyncLiveMarketData = useCallback(async (options?: { silent?: boolean }) => {
    if (liveSyncLoading || dataState.portfolio.positions.length === 0) return;

    setLiveSyncLoading(true);
    try {
      const summary = await syncLiveMarketData({ lookbackDays: 180 });
      dataDispatch({ type: "SET_MARKET_DATA_SUMMARY", summary });
      dataDispatch({ type: "SET_MARKET_DATA_MODE", mode: "api_auto" });
      dataDispatch({ type: "RESET_RESULTS" });
      dispatch({
        type: "SET_MARKET_STATUS",
        status: summary.ready ? "ready" : "idle",
        missingFactors: summary.blocking_errors,
      });
      if (summary.ready) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
      if (!options?.silent) {
        toast.success("Live market-data подтянуты", {
          description: `ЦБ/MOEX session: ${summary.session_id}`,
        });
      }
    } catch (error: any) {
      toast.danger("Не удалось подтянуть live market-data", {
        description: String(error?.message ?? "Проверьте доступность backend и источников ЦБ/MOEX."),
      });
    } finally {
      setLiveSyncLoading(false);
    }
  }, [dataDispatch, dataState.portfolio.positions.length, dispatch, liveSyncLoading]);

  const readiness = useMemo(() => {
    const hasPortfolio = dataState.portfolio.positions.length > 0;
    const noCritical = wf.validation.criticalErrors === 0;
    const marketOk =
      marketMode === "api_auto"
        ? liveMarketReady
        : wf.marketData.status === "ready" && wf.marketData.missingFactors === 0;
    const hasMetrics = selected.length > 0;
    const alphaOk = alpha > 0.5 && alpha < 0.9999;
    const tailModelOk = ["normal", "cornish_fisher"].includes(parametricTailModel);
    const baseCurrencyOk = /^[A-Z]{3}$/.test(baseCurrency);
    const fxOk = fxRatesResult.error === "" && !missingFxRequiresManualInput;
    return {
      hasPortfolio,
      noCritical,
      marketOk,
      hasMetrics,
      alphaOk,
      tailModelOk,
      baseCurrencyOk,
      fxOk,
      ready: hasPortfolio && noCritical && marketOk && hasMetrics && alphaOk && tailModelOk && baseCurrencyOk && fxOk,
    };
  }, [
    alpha,
    baseCurrency,
    dataState.portfolio.positions.length,
    fxRatesResult.error,
    marketMode,
    liveMarketReady,
    missingFxRequiresManualInput,
    parametricTailModel,
    selected.length,
    wf.marketData.missingFactors,
    wf.marketData.status,
    wf.validation.criticalErrors,
  ]);

  useEffect(() => {
    if (!apiAutoMode || liveMarketReady || liveSyncLoading || dataState.portfolio.positions.length === 0) return;
    if (liveSyncAttemptedRef.current) return;
    liveSyncAttemptedRef.current = true;
    void handleSyncLiveMarketData({ silent: true });
  }, [
    apiAutoMode,
    dataState.portfolio.positions.length,
    handleSyncLiveMarketData,
    liveMarketReady,
    liveSyncLoading,
  ]);

  const alphaPercent = Math.min(99.9, Math.max(90, Number((alpha * 100).toFixed(1))));

  const handleSaveAndGoToResults = async () => {
    if (isRunning || !readiness.ready) return;

    setIsRunning(true);
    const calcRunId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    flushSync(() => {
      dataDispatch({ type: "RESET_RESULTS" });
      dispatch({ type: "RESET_DOWNSTREAM", fromStep: WorkflowStep.Configure });
      dispatch({
        type: "SET_CALC_CONFIG",
        selectedMetrics: selected,
        params: {
          alpha,
          horizonDays,
          parametricTailModel,
          historyDays,
          baseCurrency,
          fxRates: fxRatesResult.value,
          liquidityModel,
        },
        marginEnabled: true,
      });
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Configure });
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "running", startedAt });
    });

    try {
      const useAutoMarketData = (dataState.marketDataMode ?? "api_auto") === "api_auto";
      const marketDataSessionId = dataState.marketDataSummary?.session_id;
      let scenariosForRun = dataState.scenarios;
      if (!demoMode && shouldRefreshApiScenarios(scenariosForRun)) {
        scenariosForRun = await fetchScenarioCatalog()
          .then((scenarios) => scenarios.length ? scenarios : apiScenarioFallback)
          .catch(() => apiScenarioFallback);
        dataDispatch({ type: "SET_SCENARIOS", scenarios: scenariosForRun });
      }
      if (demoMode && !scenariosForRun.length) {
        scenariosForRun = demoScenarios;
        dataDispatch({ type: "SET_SCENARIOS", scenarios: scenariosForRun });
      }

      const limitsForRun = dataState.limits && !isDemoDefaultLimits(dataState.limits)
        ? dataState.limits
        : undefined;

      const metrics = await runRiskCalculation({
        positions: dataState.portfolio.positions,
        scenarios: scenariosForRun,
        limits: limitsForRun,
        alpha,
        horizonDays,
        parametricTailModel,
        baseCurrency,
        fxRates: fxRatesResult.value,
        liquidityModel,
        selectedMetrics: selected,
        marginEnabled: true,
        marketDataSessionId,
        forceAutoMarketData: useAutoMarketData && !marketDataSessionId,
      });
      const limitSource = limitsForRun ? dataState.limitSource : "draft_auto";
      const finalMetrics = attachMethodologyMetadata(limitsForRun ? metrics : applyAutoLimits(metrics), limitSource);

      flushSync(() => {
        dataDispatch({ type: "SET_LIMITS", limits: limitsForRun ?? null, limitSource });
        dataDispatch({ type: "SET_RESULTS", metrics: finalMetrics });
        dispatch({ type: "SET_CALC_RUN", calcRunId, status: "success", startedAt, finishedAt: new Date().toISOString() });
        dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.CalcRun });
        dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
      });

      nav("/dashboard");
    } catch (error: any) {
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "error", startedAt, finishedAt: new Date().toISOString() });
      const errorMessage = String(error?.message ?? "");
      const missingCurves = Array.isArray(error?.details?.missing_curves) ? error.details.missing_curves : [];
      const affectedPositions = Array.isArray(error?.details?.affected_positions) ? error.details.affected_positions : [];
      const backendFxPairs = extractFxPairsFromError(errorMessage);
      const localFxPairs = missingFxCurrencies.map((currency) => `${currency}/${baseCurrency}`);
      const missingPairs = backendFxPairs.length ? backendFxPairs : localFxPairs;
      const looksLikeFxError = error?.status === 400 && /FX|FX-кур|не хватает FX|Нужны FX/i.test(errorMessage);
      if (error?.status === 422 && missingCurves.length > 0) {
        toast.danger("Недостаточно market-data для полного расчёта", {
          description: `Missing curves: ${missingCurves.join(", ")}${affectedPositions.length ? `. Affected positions: ${affectedPositions.slice(0, 8).join(", ")}` : ""}.`,
        });
      } else if (looksLikeFxError && missingPairs.length > 0) {
        toast.danger(`Не найдены FX: ${missingPairs.join(", ")}`, {
          description: "Загрузите market-data bundle с нужными RC_*.xlsx на странице рыночных данных или введите FX вручную в настройках.",
        });
      } else {
        toast.danger("Не удалось выполнить расчёт", {
          description: errorMessage || "Проверьте параметры и доступность API.",
        });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const statusColor = readiness.ready ? "success" : "warning";
  const statusText  = readiness.ready
    ? "Готово к запуску"
    : liveSyncLoading
      ? "Подтягиваем live market-data"
    : apiAutoMode && !liveMarketReady
      ? "Нужно подтянуть live market-data"
    : "Не всё готово";

  return (
    <div className="importPagePlain">

      {/* ── Hero ── */}
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Настройка расчёта</h1>
          <div className="importHeroMeta configureHeroMeta">
            <Chip color={statusColor} variant="soft" size="sm">{statusText}</Chip>
            <span className="importFileTag">{selected.length} метрик · α={alpha} · {horizonDays}д</span>
            {missingFxRequiresManualInput && !liveSyncLoading && (
              <Chip color="danger" variant="soft" size="sm">
                Нужны FX: {missingFxCurrencies.map((currency) => `${currency}/${baseCurrency}`).join(", ")}
              </Chip>
            )}
            {apiAutoMode && !liveMarketReady && !liveSyncLoading && (
              <Chip color="warning" variant="soft" size="sm">
                Нет готовой live session ЦБ/MOEX
              </Chip>
            )}
            {apiAutoMode && !liveMarketReady && (
              <Button
                type="button"
                variant="secondary"
                loading={liveSyncLoading}
                isDisabled={dataState.portfolio.positions.length === 0}
                onClick={() => void handleSyncLiveMarketData()}
              >
                Подтянуть из ЦБ/MOEX
              </Button>
            )}
            {apiAutoMode && liveMarketReady && dataState.marketDataSummary?.session_id && (
              <Chip color="success" variant="soft" size="sm">
                Live session: {dataState.marketDataSummary.session_id}
              </Chip>
            )}
          </div>
        </div>

        <div className="validateHeroRight">
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink"
            disabled={!readiness.ready || isRunning}
            onClick={handleSaveAndGoToResults}
            aria-label={isRunning ? "Идёт запуск расчёта" : "Перейти к результатам"}
          >
            <span className="importHeroNextLinkText pageTitle">{isRunning ? "Запуск…" : "К результатам"}</span>
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>→</span>
          </button>
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink validateHeroBackLink"
            onClick={() => nav("/market")}
            aria-label="К рыночным данным"
          >
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>←</span>
            <span className="importHeroNextLinkText pageTitle">К рыночным данным</span>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="importBody">
        <div className="importBodyMain">
          <Reveal delay={0.05}>
            <div className="configureTopGrid">
              <Card className="configureMetricsCard configureMetricsCard--compact">
                <CheckboxGroup
                  name="calc-metrics"
                  className="configureMetricGroup"
                  value={selected}
                  onChange={(values) =>
                    setSelected((values as string[]).filter((metric): metric is MetricKey => allowedMetricKeys.has(metric as MetricKey)))
                  }
                >
                  <div className="configureMetricHeaderRow">
                    <div className="configureMetricHeaderCopy">
                      <Label>Набор метрик</Label>
                      <Description className="configureMetricHeaderHint">
                        Выберите метрики, которые нужно включить в расчёт.
                      </Description>
                    </div>
                    <Button variant="secondary" onClick={() => setSelected(baseMetricSet)}>
                      Базовый набор
                    </Button>
                  </div>
                  <div className="configureMetricList configureMetricList--compact">
                    {metricCards.map((metric) => (
                      <Checkbox
                        key={metric.key}
                        value={metric.key}
                        variant="secondary"
                        className={`configureMetricOption${selected.includes(metric.key) ? " configureMetricOption--selected" : ""}`}
                      >
                        <Checkbox.Control className="configureMetricControl rounded-full before:rounded-full">
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Checkbox.Content className="configureMetricContent">
                          <span className="configureMetricGlyph" aria-hidden="true">
                            {metricGlyphByKey[metric.key]}
                          </span>
                          <div className="configureMetricCopy">
                            <Label>{metric.title}</Label>
                            <Description>{metric.summary}</Description>
                          </div>
                        </Checkbox.Content>
                      </Checkbox>
                    ))}
                  </div>
                </CheckboxGroup>
              </Card>

              <Card className="configureSectionCard configureSectionCard--params configureParamsCard">
                <div className="cardTitle">Параметры VaR/ES и агрегации</div>
                <div className="cardSubtitle">Основные параметры управляются слайдерами для быстрого тюнинга.</div>

                <div className="configureSliderGrid">
                  <Slider
                    className="configureParamSlider"
                    minValue={90}
                    maxValue={99.9}
                    step={0.1}
                    value={alphaPercent}
                    onChange={(value) => {
                      if (typeof value === "number") {
                        setAlpha(Number((value / 100).toFixed(4)));
                      }
                    }}
                    formatOptions={{ maximumFractionDigits: 1, minimumFractionDigits: 1 }}
                  >
                    <Label className="configureParamLabel">
                      <span>Уровень доверия α, %</span>
                      <ParamInfo
                        title="Уровень доверия α"
                        text="Определяет, какую часть хвоста риска вы отсекате: чем выше значение, тем консервативнее оценка VaR/ES."
                      />
                    </Label>
                    <Slider.Output className="configureParamSliderOutput" />
                    <Slider.Track className="configureParamSliderTrack">
                      <Slider.Fill className="configureParamSliderFill" />
                      <Slider.Thumb className="configureParamSliderThumb" />
                    </Slider.Track>
                  </Slider>

                  <Slider
                    className="configureParamSlider"
                    minValue={1}
                    maxValue={30}
                    step={1}
                    value={horizonDays}
                    onChange={(value) => {
                      if (typeof value === "number") {
                        setHorizonDays(Math.round(value));
                      }
                    }}
                  >
                    <Label className="configureParamLabel">
                      <span>Горизонт расчёта, дней</span>
                      <ParamInfo
                        title="Горизонт расчёта"
                        text="Показывает, на какой период агрегируется риск: короткий горизонт для оперативного контроля, длинный для стресс-оценок."
                      />
                    </Label>
                    <Slider.Output className="configureParamSliderOutput" />
                    <Slider.Track className="configureParamSliderTrack">
                      <Slider.Fill className="configureParamSliderFill" />
                      <Slider.Thumb className="configureParamSliderThumb" />
                    </Slider.Track>
                  </Slider>

                  <Slider
                    className="configureParamSlider"
                    minValue={60}
                    maxValue={750}
                    step={10}
                    value={historyDays}
                    onChange={(value) => {
                      if (typeof value === "number") {
                        setHistoryDays(Math.round(value / 10) * 10);
                      }
                    }}
                  >
                    <Label className="configureParamLabel">
                      <span>Окно истории, дней</span>
                      <ParamInfo
                        title="Окно истории"
                        text="Определяет глубину выборки рыночных наблюдений: больше окно даёт устойчивость, меньше — чувствительность к текущему режиму рынка."
                      />
                    </Label>
                    <Slider.Output className="configureParamSliderOutput" />
                    <Slider.Track className="configureParamSliderTrack">
                      <Slider.Fill className="configureParamSliderFill" />
                      <Slider.Thumb className="configureParamSliderThumb" />
                    </Slider.Track>
                  </Slider>

                  <Slider
                    className="configureParamSlider"
                    minValue={90}
                    maxValue={99.9}
                    step={0.1}
                    value={alphaBand}
                    onChange={(value) => {
                      if (Array.isArray(value) && value.length === 2) {
                        setAlphaBand([value[0], value[1]]);
                      }
                    }}
                  >
                    <Label className="configureParamLabel">
                      <span>Контрольный диапазон доверия</span>
                      <ParamInfo
                        title="Контрольный диапазон"
                        text="Визуальный диапазон для быстрой калибровки: помогает сравнить чувствительность результата при разных уровнях доверия."
                      />
                    </Label>
                    <Slider.Output className="configureParamSliderOutput" />
                    <Slider.Track className="configureParamSliderTrack">
                      {({ state }) => (
                        <>
                          <Slider.Fill className="configureParamSliderFill" />
                          {state.values.map((_, index) => (
                            <Slider.Thumb key={index} index={index} className="configureParamSliderThumb" />
                          ))}
                        </>
                      )}
                    </Slider.Track>
                  </Slider>
                </div>

                <div className="formGrid configureParamsFormGrid">
                  <div className="configureParamField configureParamField--full">
                    <div className="configureParamSelectLabel">
                      <span className="cardSubtitle">Базовая валюта</span>
                      <ParamInfo
                        title="Базовая валюта"
                        text="В этой валюте будут приведены итоговые метрики и агрегированные оценки риска по портфелю."
                      />
                    </div>
                    <Input aria-label="Базовая валюта" maxLength={3} value={baseCurrency} onChange={(event) => setBaseCurrency(event.target.value.toUpperCase())} />
                  </div>

                  <div className="configureParamField">
                    <div className="configureParamSelectLabel">
                      <span className="cardSubtitle">Tail-модель</span>
                      <ParamInfo
                        title="Tail-модель"
                        text="Задаёт способ аппроксимации хвоста распределения доходностей и влияет на величину VaR/ES в экстремальных точках."
                      />
                    </div>
                    <Select
                      aria-label="Tail-модель"
                      selectedKey={parametricTailModel}
                      onSelectionChange={(key: Key) => {
                        if (key) setParametricTailModel(String(key));
                      }}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBoxItem id="cornish_fisher">Cornish-Fisher</ListBoxItem>
                          <ListBoxItem id="normal">Normal</ListBoxItem>
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>

                  <div className="configureParamField">
                    <div className="configureParamSelectLabel">
                      <span className="cardSubtitle">Модель ликвидности</span>
                      <ParamInfo
                        title="Модель ликвидности"
                        text="Определяет, как добавляется надбавка за издержки выхода из позиции и как ликвидность увеличивает риск."
                      />
                    </div>
                    <Select
                      aria-label="Модель ликвидности"
                      selectedKey={liquidityModel}
                      onSelectionChange={(key: Key) => {
                        if (key) setLiquidityModel(String(key));
                      }}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          <ListBoxItem id="fraction_of_position_value">Haircut как доля от стоимости позиции</ListBoxItem>
                          <ListBoxItem id="half_spread_fraction">Haircut как half-spread доля</ListBoxItem>
                          <ListBoxItem id="absolute_per_contract">Haircut как абсолют на контракт</ListBoxItem>
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>
                </div>

                <Accordion variant="splitted" className="configureAccordion">
                  <Accordion.Item id="fx" className="validateAccordionItem">
                    <Accordion.Heading>
                      <Accordion.Trigger className="validateAccordionTrigger">
                        <div className="validateAccordionTitleBlock">
                          <div className="validateAccordionTitle">
                            <span>FX rates и продвинутые настройки</span>
                          </div>
                          <div className="cardSubtitle">
                            {missingFxRequiresManualInput
                              ? apiAutoMode
                                ? `В live market-data нет подтверждённых ${missingFxCurrencies.map((currency) => `${currency}/${baseCurrency}`).join(", ")}. Обновите данные из ЦБ/MOEX или задайте FX вручную.`
                                : `Для текущего портфеля нужно задать ${missingFxCurrencies.map((currency) => `${currency}/${baseCurrency}`).join(", ")}.`
                              : apiAutoMode && !liveMarketReady
                                ? "Сначала подтяните live market-data из ЦБ/MOEX на предыдущем шаге."
                              : "FX берутся из загруженного market-data bundle или из ручного JSON ниже."}
                          </div>
                        </div>
                        <Accordion.Indicator />
                      </Accordion.Trigger>
                    </Accordion.Heading>
                    <Accordion.Panel className="validateAccordionContent">
                      <Accordion.Body>
                        <TextArea
                          label="FX rates (JSON, требуется для валют не в базовой валюте)"
                          aria-label="FX rates (JSON, требуется для валют не в базовой валюте)"
                          rows={5}
                          value={fxRatesText}
                          onChange={(event) => setFxRatesText(event.target.value)}
                          className="configureTextarea"
                        />
                        {fxRatesResult.error && (
                          <Chip color="danger" variant="soft" className="importIssueChip">
                            {fxRatesResult.error}
                          </Chip>
                        )}
                        {missingFxRequiresManualInput && !fxRatesResult.error && (
                          <Chip color="warning" variant="soft" className="importIssueChip">
                            {apiAutoMode
                              ? `Обновите live market-data из ЦБ/MOEX или добавьте курс вручную в формате {${missingFxCurrencies.map((currency) => `"${currency}": 92`).join(", ")}}.`
                              : `Добавьте курс вручную в формате {${missingFxCurrencies.map((currency) => `"${currency}": 92`).join(", ")}} или загрузите RC_*.xlsx с нужными FX на странице рыночных данных.`}
                          </Chip>
                        )}
                        {apiAutoMode && !liveMarketReady && !fxRatesResult.error && (
                          <Chip color="warning" variant="soft" className="importIssueChip">
                            Расчёт заблокирован до готовой live market-data session. Вернитесь на страницу рыночных данных и нажмите «Обновить из ЦБ/MOEX».
                          </Chip>
                        )}
                        {missingFxCurrencies.length === 0 && (dataState.marketDataSummary?.available_fx_pairs?.length ?? 0) > 0 && (
                          <Chip color="success" variant="soft" className="importIssueChip">
                            Доступные FX из market-data: {dataState.marketDataSummary?.available_fx_pairs.join(", ")}.
                          </Chip>
                        )}
                      </Accordion.Body>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              </Card>
            </div>
          </Reveal>

        </div>
      </div>

    </div>
  );
}
