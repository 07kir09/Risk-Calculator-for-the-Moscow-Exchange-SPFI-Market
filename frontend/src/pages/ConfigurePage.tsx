import { Key, useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionItem,
  Checkbox,
  Chip,
  Input,
  Select,
  SelectItem,
  Tab,
  Tabs,
  Textarea,
} from "@heroui/react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Checklist from "../components/Checklist";
import HelpTooltip from "../components/HelpTooltip";
import Card from "../ui/Card";
import {
  CompareBarsChart,
  DonutGauge,
  GlassPanel,
  Reveal,
  Sparkline,
  StaggerGroup,
  StaggerItem,
} from "../components/rich/RichVisuals";
import { useAppData } from "../state/appDataStore";
import { demoScenarios } from "../mock/demoData";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

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
const targetMetricCount = 4;

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
  const [fxRatesText, setFxRatesText] = useState<string>(() => {
    const raw = wf.calcConfig.params?.fxRates;
    if (!raw || typeof raw !== "object") return "{}";
    return JSON.stringify(raw, null, 2);
  });

  useEffect(() => {
    if (!dataState.scenarios.length) {
      dataDispatch({ type: "SET_SCENARIOS", scenarios: demoScenarios });
    }
  }, [dataState.scenarios.length, dataDispatch]);

  const toggle = (key: MetricKey) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  };

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

  const selectedScenarioPreview = dataState.scenarios.slice(0, 5);
  const selectedMetricBars = useMemo(
    () =>
      metricCards.map((metric) => ({
        label: metric.key,
        value: selected.includes(metric.key) ? 100 : 18,
        tone: selected.includes(metric.key) ? "positive" as const : "neutral" as const,
      })),
    [selected]
  );
  const readinessScore = useMemo(
    () => {
      const paramsReady = readiness.alphaOk && readiness.tailModelOk && readiness.baseCurrencyOk && readiness.fxOk;
      const metricsCoverage = Math.min(selected.length / targetMetricCount, 1);

      return Math.round(
        (readiness.hasPortfolio ? 15 : 0) +
          (readiness.noCritical ? 15 : 0) +
          (readiness.marketOk ? 15 : 0) +
          (paramsReady ? 15 : 0) +
          metricsCoverage * 40
      );
    },
    [
      readiness.alphaOk,
      readiness.baseCurrencyOk,
      readiness.fxOk,
      readiness.hasMetrics,
      readiness.hasPortfolio,
      readiness.marketOk,
      readiness.noCritical,
      readiness.tailModelOk,
      selected.length,
    ]
  );
  const selectedTrendData = useMemo(
    () =>
      selectedMetricBars.slice(0, 6).map((item, index) => ({
        label: `${index + 1}`,
        value: item.value,
      })),
    [selectedMetricBars]
  );

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Настройка расчёта</h1>
          <p className="pageHint">
            Один экран для выбора метрик, параметров и набора сценариев. Здесь важно только то, что влияет на расчёт.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => setSelected(recommendedSet)}>
            Рекомендуемый набор
          </Button>
          <Button variant="secondary" onClick={() => nav("/market")}>
            Назад
          </Button>
        </div>
      </div>

      <div className="configureLayout">
        <div className="configureMain">
          <StaggerGroup className="visualSplitPanel">
            <StaggerItem>
              <GlassPanel
                title="Контур расчёта"
                subtitle="Сразу видно, сколько обязательных условий уже выполнено и какие блоки реально попадут в расчёт."
                badge={<Chip color={readiness.ready ? "success" : "warning"} variant="flat" radius="sm">{readiness.ready ? "ready" : "draft"}</Chip>}
              >
                <div className="visualSplitPanel">
                  <DonutGauge value={readinessScore} label="config" subtitle="Полнота конфигурации и набора выбранных метрик." />
                  <CompareBarsChart data={selectedMetricBars.slice(0, 6)} height={240} />
                </div>
              </GlassPanel>
            </StaggerItem>
            <StaggerItem>
              <GlassPanel title="Ритм выбора" subtitle="Sparkline показывает, насколько насыщен набор активированных метрик и сценариев.">
                <Sparkline data={selectedTrendData} color={readiness.ready ? "#6eff8e" : "#7da7ff"} height={110} />
                <div className="visualChipRow">
                  {selected.slice(0, 8).map((metric) => (
                    <Chip key={metric} color="primary" variant="flat" radius="sm">
                      {metric}
                    </Chip>
                  ))}
                </div>
              </GlassPanel>
            </StaggerItem>
          </StaggerGroup>

          <Tabs
            aria-label="Настройка расчёта"
            radius="sm"
            color="primary"
            classNames={{
              tabList: "importTabsList",
              tab: "importTab",
              cursor: "importTabCursor",
              panel: "importTabPanel",
            }}
          >
            <Tab key="metrics" title="Что считать">
              <Card>
                <div className="cardTitle">Набор метрик</div>
                <div className="cardSubtitle">Отметьте только то, что действительно нужно пользователю на выходе.</div>

                <div className="metricInlineList">
                  {metricCards.map((metric) => (
                    <label key={metric.key} className={`metricInlineOption ${selected.includes(metric.key) ? "metricInlineOption--selected" : ""}`}>
                      <Checkbox
                        isSelected={selected.includes(metric.key)}
                        onValueChange={() => toggle(metric.key)}
                        classNames={{
                          base: "metricInlineCheckbox",
                          wrapper: "metricInlineCheckboxBox",
                          icon: "metricInlineCheckboxIcon",
                          label: "metricInlineCheckboxLabel",
                        }}
                      >
                        <span className="metricInlineTitle">{metric.title}</span>
                      </Checkbox>
                      <HelpTooltip
                        text={
                          <div className="metricTooltipContent">
                            <div className="metricTooltipTitle">{metric.title}</div>
                            <div className="metricTooltipSection">
                              <span>Что это</span>
                              <p>{metric.tooltip.what}</p>
                            </div>
                            <div className="metricTooltipSection">
                              <span>Зачем нужна</span>
                              <p>{metric.tooltip.purpose}</p>
                            </div>
                            <div className="metricTooltipSection">
                              <span>Что считает</span>
                              <p>{metric.tooltip.calculates}</p>
                            </div>
                          </div>
                        }
                      />
                    </label>
                  ))}
                </div>
              </Card>
            </Tab>

            <Tab key="params" title="Параметры">
              <Card>
                <div className="cardTitle">Параметры VaR/ES и агрегации</div>
                <div className="cardSubtitle">Только параметры, которые меняют методику расчёта.</div>

                <div className="formGrid">
                  <Input type="number" label="Уровень доверия (alpha)" step="0.001" value={String(alpha)} onValueChange={(value) => setAlpha(Number(value))} />
                  <Input type="number" label="Горизонт, дней" min={1} value={String(horizonDays)} onValueChange={(value) => setHorizonDays(Number(value))} />
                  <Input type="number" label="Окно истории, дней" min={30} value={String(historyDays)} onValueChange={(value) => setHistoryDays(Number(value))} />
                  <Input label="Базовая валюта" maxLength={3} value={baseCurrency} onValueChange={(value) => setBaseCurrency(value.toUpperCase())} />

                  <Select
                    label="Tail-модель"
                    selectedKeys={[parametricTailModel]}
                    onSelectionChange={(keys) => {
                      const [key] = Array.from(keys as Set<Key>);
                      if (key) setParametricTailModel(String(key));
                    }}
                  >
                    <SelectItem key="cornish_fisher">Cornish-Fisher</SelectItem>
                    <SelectItem key="normal">Normal</SelectItem>
                  </Select>

                  <Select
                    label="Модель ликвидности"
                    selectedKeys={[liquidityModel]}
                    onSelectionChange={(keys) => {
                      const [key] = Array.from(keys as Set<Key>);
                      if (key) setLiquidityModel(String(key));
                    }}
                  >
                    <SelectItem key="fraction_of_position_value">Haircut как доля от стоимости позиции</SelectItem>
                    <SelectItem key="half_spread_fraction">Haircut как half-spread доля</SelectItem>
                    <SelectItem key="absolute_per_contract">Haircut как абсолют на контракт</SelectItem>
                  </Select>
                </div>

                <Accordion variant="splitted" className="configureAccordion">
                  <AccordionItem
                    key="fx"
                    aria-label="Продвинутые FX-настройки"
                    title="FX rates и продвинутые настройки"
                    subtitle="Откройте только если расчёт мультивалютный или нужен ручной override."
                    classNames={{ base: "validateAccordionItem", trigger: "validateAccordionTrigger", content: "validateAccordionContent" }}
                  >
                    <Textarea
                      label="FX rates (JSON, опционально)"
                      minRows={5}
                      value={fxRatesText}
                      onValueChange={setFxRatesText}
                      className="configureTextarea"
                    />
                    {fxRatesResult.error && (
                      <Chip color="danger" variant="flat" radius="sm" className="importIssueChip">
                        {fxRatesResult.error}
                      </Chip>
                    )}
                  </AccordionItem>
                </Accordion>
              </Card>
            </Tab>

            <Tab key="scenarios" title="Сценарии">
              <Card>
                <div className="cardTitle">Набор сценариев для расчёта</div>
                <div className="cardSubtitle">Полный редактор будет на шаге стресс-сценариев, но уже здесь видно, что пойдёт в расчёт.</div>

                <div className="scenarioPreviewList">
                  {selectedScenarioPreview.map((scenario) => (
                    <div key={scenario.scenario_id} className="scenarioPreviewItem">
                      <div>
                        <strong>{scenario.scenario_id}</strong>
                        <div className="textMuted">{scenario.description ?? "Без описания"}</div>
                      </div>
                      <div className="scenarioPreviewValues">
                        <span>ΔS {scenario.underlying_shift}</span>
                        <span>ΔVol {scenario.volatility_shift}</span>
                        <span>Δr {scenario.rate_shift}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </Tab>
          </Tabs>
        </div>

        <aside className="importAside">
          <Reveal delay={0.08}>
            <Card>
            <div className="cardTitle">Готовность к запуску</div>
            <div className="cardSubtitle">Если что-то не выполнено, расчёт не стартует.</div>
            <Checklist
              items={[
                { label: "Портфель загружен", done: readiness.hasPortfolio },
                { label: "Критических ошибок нет", done: readiness.noCritical },
                { label: "Рыночные данные готовы", done: readiness.marketOk },
                { label: `Метрики выбраны (${selected.length})`, done: readiness.hasMetrics },
                { label: "Параметры корректны", done: readiness.alphaOk && readiness.tailModelOk && readiness.baseCurrencyOk && readiness.fxOk },
              ]}
            />
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card>
            <div className="cardTitle">Итоговый набор</div>
            <div className="cardSubtitle">Что реально будет посчитано.</div>
            <div className="configureSelectedChips">
              {selected.map((metric) => (
                <Chip key={metric} color="primary" variant="flat" radius="sm">
                  {metric}
                </Chip>
              ))}
            </div>
            </Card>
          </Reveal>

          <Reveal delay={0.12}>
            <Card>
            <div className="cardTitle">Следующий шаг</div>
            <div className="cardSubtitle">На экране запуска будет только финальная проверка и сам расчёт.</div>
            <Button
              disabled={!readiness.ready}
              onClick={() => {
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
                    marginEnabled: selected.includes("margin_capital"),
                  });
                  dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Configure });
                });
                nav("/run");
              }}
            >
              Сохранить и перейти к запуску
            </Button>
            </Card>
          </Reveal>
        </aside>
      </div>
    </Card>
  );
}
