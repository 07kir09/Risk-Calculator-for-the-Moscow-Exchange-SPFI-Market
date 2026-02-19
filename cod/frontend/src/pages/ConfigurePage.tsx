import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Checklist from "../components/Checklist";
import HelpTooltip from "../components/HelpTooltip";
import Card from "../ui/Card";
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

const metricCards: Array<{ key: MetricKey; title: string; hint: string }> = [
  { key: "var_hist", title: "VaR (simulated/demo)", hint: "Потенциальный убыток по сценарному PnL (в демо это не исторический ряд рынка)." },
  { key: "var_param", title: "VaR (параметрический)", hint: "VaR по предположению о распределении (нормальное — демо)." },
  { key: "es_hist", title: "ES (simulated/demo)", hint: "Средний убыток в худшем хвосте сценарного распределения." },
  { key: "es_param", title: "ES (параметрический)", hint: "ES по параметрическому распределению (демо)." },
  { key: "lc_var", title: "LC VaR", hint: "VaR + надбавка за ликвидность (если задана в сделках)." },
  { key: "greeks", title: "Чувствительности (Greeks + DV01)", hint: "Показывает, что сильнее всего влияет на стоимость портфеля." },
  { key: "stress", title: "Стресс‑сценарии", hint: "Что будет при резком движении рынка (шоки по цене/воле/ставке)." },
  { key: "correlations", title: "Корреляции (демо)", hint: "Связи между факторами. Нужны для сценариев/VaR (если включено)." },
  { key: "margin_capital", title: "Маржа/капитал (демо)", hint: "Оценка требований по обеспечению и капитала для риска." },
];

const recommendedSet: MetricKey[] = ["var_hist", "es_hist", "lc_var", "greeks", "stress"];

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
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
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
      for (const [k, v] of Object.entries(parsed)) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) {
          return { value: undefined, error: `Неверный FX для ${k}: ожидается положительное число` };
        }
        out[String(k).toUpperCase()] = n;
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
    const baseCurrencyOk = /^[A-Z]{3}$/.test(baseCurrency);
    const fxOk = fxRatesResult.error === "";
    return {
      hasPortfolio,
      noCritical,
      marketOk,
      hasMetrics,
      alphaOk,
      baseCurrencyOk,
      fxOk,
      ready: hasPortfolio && noCritical && marketOk && hasMetrics && alphaOk && baseCurrencyOk && fxOk,
    };
  }, [
    dataState.portfolio.positions.length,
    wf.validation.criticalErrors,
    wf.marketData.status,
    wf.marketData.missingFactors,
    selected.length,
    alpha,
    baseCurrency,
    fxRatesResult.error,
  ]);

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 4. Настройка расчёта</h1>
          <p className="pageHint">
            Выберите, что считать — чтобы не гонять лишнее. Если вы не понимаете термин, наведите на <HelpTooltip text="Короткое объяснение термина. Формулы — в справке." />.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => setSelected(recommendedSet)}>
            Рекомендуемый набор
          </Button>
          <Button variant="secondary" onClick={() => nav("/market")}>
            Назад: рыночные данные
          </Button>
        </div>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <Card>
          <div className="cardTitle">Метрики</div>
          <div className="cardSubtitle">Отметьте галочками, что именно нужно посчитать.</div>
          <div className="stack" style={{ marginTop: 12 }}>
            {metricCards.map((m) => (
              <label key={m.key} className="row" style={{ justifyContent: "space-between" }}>
                <span className="row" style={{ gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.key)}
                    onChange={() => toggle(m.key)}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ fontWeight: 800 }}>
                    {m.title} <HelpTooltip text={m.hint} />
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <div className="cardTitle">Параметры VaR/ES</div>
          <div className="cardSubtitle">Даже если вы не считаете VaR — можно оставить по умолчанию.</div>
          <div className="stack" style={{ marginTop: 12 }}>
            <label>
              Уровень доверия (alpha) <HelpTooltip text="Например, 0.99 означает: «99% случаев должны быть лучше, чем VaR»." />
              <input type="number" step={0.001} min={0.8} max={0.999} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
            </label>
            <label>
              Горизонт (дней) <HelpTooltip text="Сколько дней «держим позицию» в расчёте риска. Для демо — параметр отчёта." />
              <input type="number" min={1} value={horizonDays} onChange={(e) => setHorizonDays(Number(e.target.value))} />
            </label>
            <label>
              Окно истории (дней) <HelpTooltip text="Сколько дней истории используем для исторического VaR/ES (демо)." />
              <input type="number" min={30} value={historyDays} onChange={(e) => setHistoryDays(Number(e.target.value))} />
            </label>
            <label>
              Базовая валюта отчёта
              <input
                type="text"
                value={baseCurrency}
                maxLength={3}
                onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
              />
            </label>
            <label>
              FX коэффициенты (JSON, опционально){" "}
              <HelpTooltip text='Пример: {"USD": 90.5, "EUR": 98.2}. Курс = сколько единиц базовой валюты за 1 единицу валюты позиции.' />
              <textarea rows={4} value={fxRatesText} onChange={(e) => setFxRatesText(e.target.value)} />
            </label>
            {fxRatesResult.error && <div className="badge danger">{fxRatesResult.error}</div>}
            <label>
              LC VaR модель ликвидности
              <select value={liquidityModel} onChange={(e) => setLiquidityModel(e.target.value)}>
                <option value="fraction_of_position_value">Haircut как доля от стоимости позиции</option>
                <option value="half_spread_fraction">Haircut как half-spread доля</option>
                <option value="absolute_per_contract">Haircut как абсолют на контракт</option>
              </select>
            </label>
          </div>
        </Card>

        <Card>
          <div className="cardTitle">Стресс‑сценарии (будут использованы при расчёте)</div>
          <div className="cardSubtitle">Потом их можно запускать и сравнивать на шаге «Стрессы».</div>
          <div className="stack" style={{ marginTop: 12 }}>
            {(dataState.scenarios || []).slice(0, 6).map((s) => (
              <div key={s.scenario_id} className="row wrap" style={{ justifyContent: "space-between" }}>
                <span style={{ fontWeight: 800 }}>{s.scenario_id}</span>
                <span className="textMuted">ΔS {s.underlying_shift}, ΔVol {s.volatility_shift}, Δr {s.rate_shift}</span>
              </div>
            ))}
            <div className="textMuted">Редактор сценариев будет доступен после расчёта (шаг «Стрессы»).</div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="cardTitle">Чек‑лист готовности</div>
            <div className="cardSubtitle">Если что‑то не готово — подсветим.</div>
          </div>
          <Button
            data-testid="save-config"
            disabled={!readiness.ready}
            onClick={() => {
              dataDispatch({ type: "RESET_RESULTS" });
              dispatch({ type: "RESET_DOWNSTREAM", fromStep: WorkflowStep.Configure });
              dispatch({
                type: "SET_CALC_CONFIG",
                selectedMetrics: selected,
                params: {
                  alpha,
                  horizonDays,
                  historyDays,
                  baseCurrency,
                  fxRates: fxRatesResult.value,
                  liquidityModel,
                },
                marginEnabled: selected.includes("margin_capital"),
              });
              dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Configure });
              nav("/run");
            }}
          >
            Сохранить и перейти к запуску
          </Button>
        </div>

        <div style={{ marginTop: 12 }}>
          <Checklist
            items={[
              { label: "Сделки загружены", done: readiness.hasPortfolio },
              { label: `Критических ошибок нет (${wf.validation.criticalErrors})`, done: readiness.noCritical },
              { label: "Рыночные данные привязаны", done: readiness.marketOk },
              { label: `Метрики выбраны (${selected.length})`, done: readiness.hasMetrics },
              { label: "Параметры корректны", done: readiness.alphaOk, hint: readiness.alphaOk ? undefined : "Проверьте alpha" },
              { label: "Базовая валюта корректна", done: readiness.baseCurrencyOk, hint: readiness.baseCurrencyOk ? undefined : "Ожидается код ISO 4217" },
              { label: "FX JSON корректен", done: readiness.fxOk, hint: readiness.fxOk ? undefined : fxRatesResult.error || "Проверьте JSON" },
            ]}
          />
        </div>
      </Card>
    </Card>
  );
}
