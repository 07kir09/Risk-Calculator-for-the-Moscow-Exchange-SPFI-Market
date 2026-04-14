import { Key, useEffect, useMemo, useState } from "react";
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
  Tabs,
  TextArea,
  Tooltip,
  toast,
} from "@heroui/react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import { Reveal } from "../components/rich/RichVisuals";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { runRiskCalculation } from "../api/services/risk";
import { ScenarioDTO } from "../api/contracts/metrics";


type MetricKey =
  | "var_hist"
  | "var_param"
  | "es_hist"
  | "es_param"
  | "lc_var"
  | "greeks"
  | "stress"
  | "correlations"
  | "margin_capital";

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
    title: "VaR (сценарный)",
    summary: "Базовый исторический VaR для оценки хвостового убытка по сценариям.",
    tags: ["сценарный", "квантиль"],
    tooltip: {
      what: "Метрика показывает пороговый убыток, который портфель может превысить только в редких исторических или сценарных случаях.",
      purpose: "Нужна для базовой оценки рыночного риска и для разговора с пользователем в формате «сколько можно потерять при обычном стрессовом дне».",
      calculates: "Считает квантиль распределения PnL по историческим/сценарным наблюдениям на выбранном уровне доверия и горизонте.",
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
    tags: ["сценарии", "what-if"],
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
  {
    key: "margin_capital",
    title: "Маржа и капитал",
    summary: "Требуемое обеспечение, вариационная маржа и капитал под риск.",
    tags: ["обеспечение", "капитал"],
    tooltip: {
      what: "Это блок не про хвостовое распределение, а про ресурс, который нужен для обслуживания и покрытия риска портфеля.",
      purpose: "Нужен, когда пользователь должен понимать не только риск убытка, но и операционную нагрузку на лимиты, залоги и капитал.",
      calculates: "Считает initial margin, variation margin, капитал и связанные показатели обеспечения по текущему портфелю.",
    },
  },
];

const recommendedSet: MetricKey[] = ["var_hist", "es_hist", "lc_var", "greeks", "stress"];

const metricGlyphByKey: Record<MetricKey, string> = {
  var_hist: "VH",
  var_param: "VP",
  es_hist: "EH",
  es_param: "EP",
  lc_var: "LC",
  greeks: "GR",
  stress: "ST",
  correlations: "CR",
  margin_capital: "MC",
};

type ScenarioPreset = ScenarioDTO & {
  title: string;
  regime: string;
  sourceNote: string;
};
type StressTabKey = "fx" | "rates" | "macro";

const stressScenarioPresets: ScenarioPreset[] = [
  {
    scenario_id: "rub_weak_risk_off",
    title: "Ослабление рубля + risk-off",
    description: "Резкое ослабление RUB, давление на риск-активы и рост рыночной волатильности.",
    underlying_shift: -0.12,
    volatility_shift: 0.35,
    rate_shift: 0.03,
    probability: 0.16,
    regime: "FX / риск-офф",
    sourceNote: "Типовой стресс для локального рынка при внешнем шоке ликвидности.",
  },
  {
    scenario_id: "cbr_rate_hike_shock",
    title: "Экстренный рост ключевой ставки",
    description: "Внеплановое ужесточение ДКП: ставка вверх, риск-активы вниз, вола вверх.",
    underlying_shift: -0.06,
    volatility_shift: 0.18,
    rate_shift: 0.025,
    probability: 0.14,
    regime: "Ставки",
    sourceNote: "Проверка устойчивости к резкому росту стоимости фондирования.",
  },
  {
    scenario_id: "cbr_rate_cut_relief",
    title: "Резкое смягчение ДКП",
    description: "Снижение ставки, локальный риск-он, частичное сжатие implied volatility.",
    underlying_shift: 0.08,
    volatility_shift: -0.14,
    rate_shift: -0.015,
    probability: 0.1,
    regime: "Ставки / риск-он",
    sourceNote: "Контр-сценарий для оценки асимметрии портфеля.",
  },
  {
    scenario_id: "commodity_drop",
    title: "Сырьевой шок вниз",
    description: "Просадка commodity-факторов с переносом в FX и риск-премию рынка.",
    underlying_shift: -0.15,
    volatility_shift: 0.28,
    rate_shift: 0.01,
    probability: 0.12,
    regime: "Сырье",
    sourceNote: "Проверка портфеля в фазе ухудшения экспортной конъюнктуры.",
  },
  {
    scenario_id: "global_liquidity_squeeze",
    title: "Глобальный liquidity squeeze",
    description: "Одновременное расширение спредов, корреляций и волатильностей.",
    underlying_shift: -0.18,
    volatility_shift: 0.45,
    rate_shift: 0.015,
    probability: 0.18,
    regime: "Глобальный стресс",
    sourceNote: "Сценарий масштаба broad sell-off / flight-to-quality.",
  },
  {
    scenario_id: "sanctions_gap",
    title: "Санкционный гэп / фрагментация",
    description: "Событийный шок с разрывом ликвидности и ростом волатильности.",
    underlying_shift: -0.1,
    volatility_shift: 0.5,
    rate_shift: 0.035,
    probability: 0.13,
    regime: "Событийный риск",
    sourceNote: "Оценка устойчивости к дискретным геополитическим событиям.",
  },
  {
    scenario_id: "fx_carry_recovery",
    title: "Нормализация FX / carry-recovery",
    description: "Стабилизация после шока: риск-премия и волатильность снижаются.",
    underlying_shift: 0.05,
    volatility_shift: -0.1,
    rate_shift: -0.008,
    probability: 0.09,
    regime: "Нормализация",
    sourceNote: "Позитивный сценарий для оценки upside-профиля.",
  },
  {
    scenario_id: "sticky_inflation",
    title: "Упрямая инфляция",
    description: "Инфляция выше ожиданий, ставка выше дольше, давление на оценку активов.",
    underlying_shift: -0.05,
    volatility_shift: 0.12,
    rate_shift: 0.01,
    probability: 0.08,
    regime: "Макро-инфляция",
    sourceNote: "Среднесрочный стресс для портфеля чувствительного к дюрации.",
  },
];

const stressPresetCategoryById: Record<string, StressTabKey> = {
  rub_weak_risk_off: "fx",
  fx_carry_recovery: "fx",
  cbr_rate_hike_shock: "rates",
  cbr_rate_cut_relief: "rates",
  sticky_inflation: "rates",
  commodity_drop: "macro",
  global_liquidity_squeeze: "macro",
  sanctions_gap: "macro",
};

const stressTabMeta: Record<StressTabKey, { title: string; hint: string }> = {
  fx: {
    title: "FX и валютные шоки",
    hint: "Шоки курса и связанные эффекты на валютные позиции.",
  },
  rates: {
    title: "Ставки и инфляция",
    hint: "Сценарии движения ключевой ставки и инфляционного давления.",
  },
  macro: {
    title: "Макро / риск-офф",
    hint: "Событийные и системные сценарии для общего stress-режима.",
  },
};

const stressScenarioPresetById: Record<string, ScenarioPreset> = Object.fromEntries(
  stressScenarioPresets.map((scenario) => [scenario.scenario_id, scenario])
);

const legacyScenarioIds = new Set(["mild_down", "base", "shock_down"]);

function scenarioLabel(id: string): string {
  return stressScenarioPresetById[id]?.title ?? id;
}

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
    return current.length ? current : recommendedSet;
  });
  const [alpha, setAlpha] = useState<number>(() => Number(wf.calcConfig.params?.alpha ?? 0.99));
  const [horizonDays, setHorizonDays] = useState<number>(() => Number(wf.calcConfig.params?.horizonDays ?? 10));
  const [parametricTailModel, setParametricTailModel] = useState<string>(() => String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher"));
  const [historyDays, setHistoryDays] = useState<number>(() => Number(wf.calcConfig.params?.historyDays ?? 250));
  const [baseCurrency, setBaseCurrency] = useState<string>(() => String(wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase());
  const [liquidityModel, setLiquidityModel] = useState<string>(() => String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value"));
  const [alphaBand, setAlphaBand] = useState<[number, number]>(() => [95, 99]);
  const [activeWorkspace, setActiveWorkspace] = useState<"configure" | "stress">("configure");
  const [activeScenarioTab, setActiveScenarioTab] = useState<StressTabKey>("fx");

  const [fxRatesText, setFxRatesText] = useState<string>(() => {
    const raw = wf.calcConfig.params?.fxRates;
    if (!raw || typeof raw !== "object") return "{}";
    return JSON.stringify(raw, null, 2);
  });

  // Scenario management
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(() => String(wf.calcConfig.params?.selectedStressScenarioId ?? ""));

  useEffect(() => {
    const hasOnlyLegacyScenarios =
      dataState.scenarios.length > 0 &&
      dataState.scenarios.every((scenario) => legacyScenarioIds.has(scenario.scenario_id));
    if (!dataState.scenarios.length || hasOnlyLegacyScenarios) {
      const scenarios = stressScenarioPresets.map(({ title, regime, sourceNote, ...scenario }) => scenario);
      dataDispatch({ type: "SET_SCENARIOS", scenarios });
      setSelectedScenarioId(scenarios[0]?.scenario_id ?? "");
    }
  }, [dataDispatch, dataState.scenarios]);

  useEffect(() => {
    if (!dataState.scenarios.length) {
      setSelectedScenarioId("");
      return;
    }
    const availableIds = new Set(dataState.scenarios.map((scenario) => scenario.scenario_id));
    setSelectedScenarioId((prev) => {
      if (prev && availableIds.has(prev)) return prev;
      return dataState.scenarios[0]?.scenario_id ?? "";
    });
  }, [dataState.scenarios]);


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

  const readiness = useMemo(() => {
    const hasPortfolio = dataState.portfolio.positions.length > 0;
    const noCritical = wf.validation.criticalErrors === 0;
    const marketOk = wf.marketData.status === "ready" && wf.marketData.missingFactors === 0;
    const hasMetrics = selected.length > 0;
    const alphaOk = alpha > 0.5 && alpha < 0.9999;
    const tailModelOk = ["normal", "cornish_fisher"].includes(parametricTailModel);
    const baseCurrencyOk = /^[A-Z]{3}$/.test(baseCurrency);
    const fxOk = fxRatesResult.error === "";
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
    parametricTailModel,
    selected.length,
    wf.marketData.missingFactors,
    wf.marketData.status,
    wf.validation.criticalErrors,
  ]);

  const alphaPercent = Math.min(99.9, Math.max(90, Number((alpha * 100).toFixed(1))));

  const [isRunning, setIsRunning] = useState(false);

  const handleSaveAndRun = async () => {
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
          selectedStressScenarioId: selectedScenarioId,
        },
        marginEnabled: selected.includes("margin_capital"),
      });
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Configure });
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "running", startedAt });
    });

    try {
      const selectedScenario = dataState.scenarios.find((scenario) => scenario.scenario_id === selectedScenarioId);
      const activeScenarios = selectedScenario
        ? [selectedScenario]
        : (dataState.scenarios.length ? [dataState.scenarios[0]] : []);
      const metrics = await runRiskCalculation({
        positions: dataState.portfolio.positions,
        scenarios: activeScenarios,
        limits: dataState.limits ?? undefined,
        alpha, horizonDays, parametricTailModel, baseCurrency,
        fxRates: fxRatesResult.value, liquidityModel,
        selectedMetrics: selected,
        marginEnabled: selected.includes("margin_capital"),
        marketDataSessionId: dataState.marketDataSummary?.session_id,
      });
      flushSync(() => {
        dataDispatch({ type: "SET_RESULTS", metrics });
        dispatch({ type: "SET_CALC_RUN", calcRunId, status: "success", startedAt, finishedAt: new Date().toISOString() });
        dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.CalcRun });
        dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
      });
      nav("/dashboard");
    } catch (error: unknown) {
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "error", startedAt, finishedAt: new Date().toISOString() });
      toast.danger("Не удалось выполнить расчёт", {
        description: error instanceof Error ? error.message : "Проверьте параметры и доступность API.",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const statusColor = readiness.ready ? "success" : "warning";
  const statusText  = readiness.ready ? "Готово к запуску" : "Не всё готово";
  const selectedScenarioCount = selectedScenarioId ? 1 : 0;
  const categorizedScenarios = useMemo(() => {
    const groups: Record<StressTabKey, typeof dataState.scenarios> = {
      fx: [],
      rates: [],
      macro: [],
    };
    for (const scenario of dataState.scenarios) {
      const key = stressPresetCategoryById[scenario.scenario_id] ?? "macro";
      groups[key].push(scenario);
    }
    return groups;
  }, [dataState.scenarios]);

  return (
    <div className="importPagePlain">

      {/* ── Hero ── */}
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Настройка расчёта</h1>
          <div className="configureHeroTabs" role="tablist" aria-label="Рабочая область настройки">
            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspace === "configure"}
              className={`configureHeroTab${activeWorkspace === "configure" ? " configureHeroTab--active" : ""}`}
              onClick={() => setActiveWorkspace("configure")}
            >
              Настройка
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspace === "stress"}
              className={`configureHeroTab${activeWorkspace === "stress" ? " configureHeroTab--active" : ""}`}
              onClick={() => setActiveWorkspace("stress")}
            >
              Стресс-сценарии
            </button>
          </div>
          <div className="importHeroMeta">
            <Chip color={statusColor} variant="soft" size="sm">{statusText}</Chip>
            <span className="importFileTag">{selected.length} метрик · α={alpha} · {horizonDays}д</span>
          </div>
        </div>

        <div className="validateHeroRight">
          {activeWorkspace === "configure" && (
            <>
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink"
            disabled={!readiness.ready || isRunning}
            onClick={handleSaveAndRun}
            aria-label="Сохранить и перейти к запуску"
          >
            <span className="importHeroNextLinkText pageTitle">{isRunning ? "Запуск…" : "К запуску расчёта"}</span>
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
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="importBody">
        <div className="importBodyMain">
          {activeWorkspace === "configure" ? (
            <Reveal delay={0.05}>
              <div className="configureTopGrid">
                <Card className="configureMetricsCard configureMetricsCard--compact">
                  <CheckboxGroup
                    name="calc-metrics"
                    className="configureMetricGroup"
                    value={selected}
                    onChange={(values) => setSelected(values as MetricKey[])}
                  >
                    <div className="configureMetricHeaderRow">
                      <div className="configureMetricHeaderCopy">
                        <Label>Набор метрик</Label>
                        <Description className="configureMetricHeaderHint">
                          Выберите метрики, которые нужно включить в расчёт.
                        </Description>
                      </div>
                      <Button variant="secondary" onClick={() => setSelected(recommendedSet)}>
                        Рекомендуемые
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
                        onSelectionChange={(key: Key | null) => {
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
                        onSelectionChange={(key: Key | null) => {
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

                  <Accordion className="configureAccordion">
                    <Accordion.Item id="fx" className="validateAccordionItem">
                      <Accordion.Heading>
                        <Accordion.Trigger className="validateAccordionTrigger">
                          <div className="validateAccordionTitleBlock">
                            <div className="validateAccordionTitle">
                              <span>FX rates и продвинутые настройки</span>
                            </div>
                            <div className="cardSubtitle">
                              Откройте только если расчёт мультивалютный или нужен ручной override.
                            </div>
                          </div>
                          <Accordion.Indicator />
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel className="validateAccordionContent">
                        <Accordion.Body>
                          <TextArea
                            aria-label="FX rates (JSON, опционально)"
                            placeholder="FX rates (JSON, опционально)"
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
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                </Card>
              </div>
            </Reveal>
          ) : (
            <Reveal delay={0.05}>
              <div className="stressWorkspace">
                <div className="stressWorkspaceHeader">
                  <div>
                    <div className="cardTitle">Стресс-сценарии</div>
                    <div className="cardSubtitle">
                      Выберите набор шоков, который нужно включить в расчёт. Интерфейс показывает только ключевые параметры сценария.
                    </div>
                  </div>
                  <div className="stressWorkspaceActions">
                    <Chip size="sm" color={selectedScenarioCount > 0 ? "success" : "warning"} variant="soft">
                      {selectedScenarioCount} из {dataState.scenarios.length} выбрано
                    </Chip>
                  </div>
                </div>

                <div className="stressLegend">
                  <div className="stressLegendTitle">Обозначения коэффициентов</div>
                  <div className="stressLegendRow">
                    <span className="stressLegendItem">ΔS: изменение базового актива</span>
                    <span className="stressLegendItem">ΔVol: изменение волатильности</span>
                    <span className="stressLegendItem">Δr: сдвиг процентной ставки (п.п.)</span>
                  </div>
                </div>

                <Tabs
                  className="stressMinimalTabs"
                  orientation="vertical"
                  variant="secondary"
                  selectedKey={activeScenarioTab}
                  onSelectionChange={(key) => setActiveScenarioTab(String(key) as StressTabKey)}
                >
                  <Tabs.ListContainer className="stressMinimalListContainer">
                    <Tabs.List aria-label="Группы стресс-сценариев" className="stressMinimalList">
                      <Tabs.Tab id="fx" className="stressMinimalTab">
                        <div className="stressMinimalTabInner">
                          <span className="stressMinimalTabTitle">FX и валюта</span>
                          <span className="stressMinimalTabHint">{categorizedScenarios.fx.length} сценариев</span>
                        </div>
                        <Tabs.Indicator />
                      </Tabs.Tab>
                      <Tabs.Tab id="rates" className="stressMinimalTab">
                        <div className="stressMinimalTabInner">
                          <span className="stressMinimalTabTitle">Ставки и инфляция</span>
                          <span className="stressMinimalTabHint">{categorizedScenarios.rates.length} сценариев</span>
                        </div>
                        <Tabs.Indicator />
                      </Tabs.Tab>
                      <Tabs.Tab id="macro" className="stressMinimalTab">
                        <div className="stressMinimalTabInner">
                          <span className="stressMinimalTabTitle">Макро / риск-офф</span>
                          <span className="stressMinimalTabHint">{categorizedScenarios.macro.length} сценариев</span>
                        </div>
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    </Tabs.List>
                  </Tabs.ListContainer>

                  {(["fx", "rates", "macro"] as StressTabKey[]).map((tabId) => (
                    <Tabs.Panel key={tabId} id={tabId} className="stressMinimalPanel">
                      <div className="stressMinimalPanelTop">
                        <h3 className="stressMinimalPanelTitle">{stressTabMeta[tabId].title}</h3>
                        <p className="stressMinimalPanelHint">{stressTabMeta[tabId].hint}</p>
                      </div>
                      {categorizedScenarios[tabId].length === 0 ? (
                        <div className="stressMinimalEmpty">В этой группе пока нет сценариев.</div>
                      ) : (
                        <div className="stressMinimalGrid">
                          {categorizedScenarios[tabId].map((scenario) => {
                            const isActive = selectedScenarioId === scenario.scenario_id;
                            return (
                              <button
                                key={scenario.scenario_id}
                                type="button"
                                className={`stressMinimalCard${isActive ? " stressMinimalCard--active" : ""}`}
                                onClick={() => setSelectedScenarioId(scenario.scenario_id)}
                                aria-pressed={isActive}
                              >
                                <div className="stressMinimalCardTop">
                                  <span className={`stressMinimalCheck${isActive ? " stressMinimalCheck--on" : ""}`} aria-hidden>
                                    {isActive ? "✓" : ""}
                                  </span>
                                  <span className="stressMinimalName">{scenarioLabel(scenario.scenario_id)}</span>
                                  {isActive ? (
                                    <span className="stressMinimalBadge">в расчёте</span>
                                  ) : (
                                    <span className="stressMinimalBadge stressMinimalBadge--off">не выбран</span>
                                  )}
                                </div>
                                <p className="stressMinimalDesc">{scenario.description ?? "Описание не задано."}</p>
                                <div className="stressMinimalShiftRow">
                                  <span className={`stressShiftBadge${scenario.underlying_shift > 0 ? " stressShiftBadge--pos" : scenario.underlying_shift < 0 ? " stressShiftBadge--neg" : ""}`}>
                                    ΔS {scenario.underlying_shift > 0 ? "+" : ""}{(scenario.underlying_shift * 100).toFixed(1)}%
                                  </span>
                                  <span className={`stressShiftBadge${scenario.volatility_shift > 0.05 ? " stressShiftBadge--warn" : scenario.volatility_shift < -0.05 ? " stressShiftBadge--pos" : ""}`}>
                                    ΔVol {scenario.volatility_shift > 0 ? "+" : ""}{(scenario.volatility_shift * 100).toFixed(1)}%
                                  </span>
                                  <span className={`stressShiftBadge${scenario.rate_shift > 0 ? " stressShiftBadge--neg" : scenario.rate_shift < 0 ? " stressShiftBadge--pos" : ""}`}>
                                    Δr {scenario.rate_shift > 0 ? "+" : ""}{(scenario.rate_shift * 100).toFixed(2)}pp
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Tabs.Panel>
                  ))}
                </Tabs>
                <div className="stressPresetOnlyNote">Доступны только преднастроенные сценарии. Пользовательские сценарии временно скрыты.</div>
              </div>
            </Reveal>
          )}
        </div>
      </div>

    </div>
  );
}
