import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import HelpTooltip from "../components/HelpTooltip";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { PositionDTO } from "../api/types";
import { runRiskCalculation } from "../api/services/risk";
import { formatNumber } from "../utils/format";

type HedgeKind = "delta" | "dv01" | "vega";

type HedgeDraft = {
  title: string;
  rationale: string;
  position: PositionDTO;
};

function uuid() {
  return (globalThis.crypto as any)?.randomUUID?.() ?? String(Date.now());
}

export default function HedgePage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf } = useWorkflow();
  const m = dataState.results.metrics;
  const basePositions = dataState.portfolio.positions;

  const [hedgePct, setHedgePct] = useState(100);
  const [loading, setLoading] = useState<HedgeKind | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const template = basePositions[0];
  const alpha = Number(wf.calcConfig.params?.alpha ?? 0.99);
  const horizonDays = Number(wf.calcConfig.params?.horizonDays ?? 10);
  const parametricTailModel = String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher");
  const baseCurrency = String(wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase();
  const fxRates = (wf.calcConfig.params?.fxRates as Record<string, number> | undefined) ?? undefined;
  const liquidityModel = String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value");

  const suggestions = useMemo(() => {
    if (!m?.greeks || !template) return [];
    const s: Array<{
      kind: HedgeKind;
      title: string;
      metricKey: keyof NonNullable<typeof m.greeks>;
      current: number;
      buildCandidate: () => PositionDTO;
      rationale: string;
    }> = [];

    const delta = m.greeks.delta;
    const dv01 = m.greeks.dv01;
    const vega = m.greeks.vega;

    if (Number.isFinite(delta) && Math.abs(delta) > 1e-12) {
      s.push({
        kind: "delta",
        title: "Снизить риск по цене (Delta)",
        metricKey: "delta",
        current: delta,
        rationale:
          "Delta показывает, насколько портфель меняется при изменении цены базового актива. Простой хедж — добавить форвард в противоположную сторону.",
        buildCandidate: () => ({
          instrument_type: "forward",
          position_id: `hedge_fwd_${uuid()}`,
          option_type: "call",
          style: "european",
          quantity: 1,
          notional: template.notional ?? 1,
          underlying_symbol: template.underlying_symbol,
          underlying_price: template.underlying_price,
          strike: template.underlying_price,
          volatility: 0,
          maturity_date: template.maturity_date,
          valuation_date: template.valuation_date,
          risk_free_rate: template.risk_free_rate,
          dividend_yield: template.dividend_yield ?? 0,
          currency: template.currency,
        }),
      });
    }

    if (Number.isFinite(dv01) && Math.abs(dv01) > 1e-12) {
      s.push({
        kind: "dv01",
        title: "Снизить риск по ставке (DV01)",
        metricKey: "dv01",
        current: dv01,
        rationale:
          "DV01 показывает, насколько портфель меняется при сдвиге ставки на +1 б.п. Простой хедж — добавить процентный своп в противоположную сторону.",
        buildCandidate: () => ({
          instrument_type: "swap_ir",
          position_id: `hedge_swap_${uuid()}`,
          option_type: "call",
          style: "european",
          quantity: 1,
          notional: template.notional ?? 1,
          underlying_symbol: "IR",
          underlying_price: 1,
          strike: template.risk_free_rate,
          volatility: 0,
          maturity_date: template.maturity_date,
          valuation_date: template.valuation_date,
          risk_free_rate: template.risk_free_rate,
          currency: template.currency,
          day_count: 0.5,
        }),
      });
    }

    if (Number.isFinite(vega) && Math.abs(vega) > 1e-12) {
      s.push({
        kind: "vega",
        title: "Снизить риск по волатильности (Vega)",
        metricKey: "vega",
        current: vega,
        rationale:
          "Vega показывает, насколько портфель меняется при росте волатильности. Простой хедж — добавить опцион (long/short vol) в противоположную сторону.",
        buildCandidate: () => ({
          instrument_type: "option",
          position_id: `hedge_opt_${uuid()}`,
          option_type: "call",
          style: "european",
          quantity: 1,
          notional: 1,
          underlying_symbol: template.underlying_symbol,
          underlying_price: template.underlying_price,
          strike: template.underlying_price,
          volatility: template.instrument_type === "option" ? template.volatility : 0.2,
          maturity_date: template.maturity_date,
          valuation_date: template.valuation_date,
          risk_free_rate: template.risk_free_rate,
          dividend_yield: template.dividend_yield ?? 0,
          currency: template.currency,
          model: "black_scholes",
        }),
      });
    }

    return s;
  }, [m?.greeks, template]);

  if (!m) {
    return (
      <Card>
        <h1 className="pageTitle">Подсказки по хеджу</h1>
        <p className="pageHint">Пока нет результатов. Сначала запустите расчёт, чтобы мы увидели ваши риски.</p>
        <Button onClick={() => nav("/dashboard")}>Перейти к результатам</Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Подсказки по хеджу</h1>
          <p className="pageHint">
            Выберите, какой риск хотите уменьшить. Мы предложим простую “идею хеджа” и отправим её в песочницу “Что если”, чтобы вы увидели эффект.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/actions")}>Назад</Button>
          <Button variant="secondary" onClick={() => nav("/what-if")}>Открыть песочницу</Button>
        </div>
      </div>

      {errorText && (
        <div className="badge danger pageSection--tight">
          {errorText}
        </div>
      )}

      <Card>
        <div className="pageHeader">
          <div>
            <div className="cardTitle">Насколько хеджировать?</div>
            <div className="cardSubtitle">
              100% — попытка “обнулить” выбранную метрику (в рамках нашей модели). Начните с 25–50% и сравните эффект.
            </div>
          </div>
          <div className="inlineActions">
            <label className="row">
              <span className="textMuted">Доля:</span>
              <input
                className="narrowInput"
                type="number"
                min={0}
                max={100}
                value={hedgePct}
                onChange={(e) => setHedgePct(Number(e.target.value))}
              />
              <span className="textMuted">%</span>
              <HelpTooltip text="Это не торговая рекомендация. Это инструмент для «что‑если»: вы увидите, как меняются метрики при добавлении простого хеджа." />
            </label>
          </div>
        </div>
      </Card>

      <div className="grid pageSection--tight">
        {suggestions.length === 0 ? (
          <Card>
            <div className="cardTitle">Нет доступных подсказок</div>
            <div className="cardSubtitle">Проверьте, что в настройках были включены Greeks/DV01.</div>
          </Card>
        ) : (
          suggestions.map((s) => (
            <Card key={s.kind}>
              <div className="pageHeader">
                <div className="cardTitle">{s.title}</div>
                <div className="badge ok" title={String(s.current)}>
                  Сейчас: {formatNumber(s.current)}
                </div>
              </div>
              <div className="cardSubtitle statusMessage--compact">
                {s.rationale}
              </div>
              <div className="inlineActions pageSection--tight">
                <Button
                  loading={loading === s.kind}
                  disabled={loading !== null}
                  onClick={async () => {
                    setErrorText(null);
                    setLoading(s.kind);
                    try {
                      const useAutoMarketData = (dataState.marketDataMode ?? "api_auto") === "api_auto";
                      const candidate = s.buildCandidate();
                      const perUnit = await runRiskCalculation({
                        positions: [{ ...candidate, quantity: 1 }],
                        scenarios: [],
                        limits: undefined,
                        alpha,
                        horizonDays,
                        parametricTailModel,
                        baseCurrency,
                        fxRates,
                        liquidityModel,
                        selectedMetrics: ["greeks"],
                        marginEnabled: false,
                        marketDataSessionId: useAutoMarketData ? undefined : dataState.marketDataSummary?.session_id,
                        forceAutoMarketData: useAutoMarketData,
                      });
                      const unitExposure = perUnit.greeks?.[s.metricKey as string] ?? Number.NaN;
                      if (!Number.isFinite(unitExposure) || unitExposure === 0) {
                        throw new Error(`Не удалось оценить «единичную» экспозицию для ${s.metricKey}.`);
                      }
                      const target = s.current * (Number.isFinite(hedgePct) ? hedgePct / 100 : 1);
                      const qty = -target / unitExposure;

                      const draft: HedgeDraft = {
                        title: s.title,
                        rationale: `${s.metricKey.toUpperCase()} сейчас: ${s.current}. Доля: ${hedgePct}%.`,
                        position: { ...candidate, quantity: qty },
                      };
                      nav("/what-if", { state: { hedgeDraft: draft } });
                    } catch (e: any) {
                      setErrorText(e?.message ?? "Не удалось подготовить хедж");
                    } finally {
                      setLoading(null);
                    }
                  }}
                >
                  Применить в песочнице
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </Card>
  );
}
