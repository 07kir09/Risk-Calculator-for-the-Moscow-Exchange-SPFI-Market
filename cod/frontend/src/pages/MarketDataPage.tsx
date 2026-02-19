import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import StatePanel from "../ui/StatePanel";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

export default function MarketDataPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const [localLoading, setLocalLoading] = useState(false);

  const hasPortfolio = dataState.portfolio.positions.length > 0;

  const missingFactorsEstimate = useMemo(() => {
    if (!hasPortfolio) return 0;
    const missing = dataState.portfolio.positions.filter((p) => !p.currency || !p.underlying_symbol).length;
    return missing;
  }, [hasPortfolio, dataState.portfolio.positions]);

  const isReady = wf.marketData.status === "ready" && wf.marketData.missingFactors === 0;

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 3. Связь с рыночными данными</h1>
          <p className="pageHint">
            На этом шаге каждая сделка “привязывается” к тому, от чего она зависит: ставка, FX, волатильность и т.д.
            В демо‑режиме используются значения прямо из файла (без внешних источников).
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/validate")}>
            Назад: проверка данных
          </Button>
        </div>
      </div>

      {!hasPortfolio && (
        <StatePanel
          tone="warning"
          title="Портфель пуст"
          description="Сначала загрузите позиции на шаге импорта, затем вернитесь к рыночным данным."
          action={<Button onClick={() => nav("/import")}>Перейти к импорту</Button>}
        />
      )}

      {hasPortfolio && (
        <StatePanel
          tone={isReady ? "success" : localLoading || wf.marketData.status === "loading" ? "info" : "warning"}
          title={isReady ? "Связка факторов готова" : localLoading || wf.marketData.status === "loading" ? "Подтягиваем данные рынка" : "Нужна связка рыночных факторов"}
          description={
            isReady
              ? "Все сделки получили необходимые рыночные факторы."
              : "После подтяжки данных можно перейти к настройке расчёта."
          }
        />
      )}

      <div className="grid" style={{ marginTop: 12 }}>
        <Card>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <span className="code">Статус</span>
            {isReady ? <span className="badge ok">Готово</span> : localLoading || wf.marketData.status === "loading" ? <span className="badge warn">Загружаем…</span> : <span className="badge warn">Нужно выполнить</span>}
          </div>
          <div className="stack" style={{ marginTop: 10 }}>
            <div>Сделок: <span className="code">{dataState.portfolio.positions.length}</span></div>
            <div>Проблемных сделок (оценка): <span className="code">{missingFactorsEstimate}</span></div>
            <div>Отсутствующих факторов (статус): <span className="code">{wf.marketData.missingFactors}</span></div>
          </div>
          <div className="row wrap" style={{ marginTop: 12 }}>
            <Button
              data-testid="fetch-market"
              disabled={!hasPortfolio || localLoading}
              onClick={() => {
                dataDispatch({ type: "RESET_RESULTS" });
                dispatch({ type: "RESET_DOWNSTREAM", fromStep: WorkflowStep.MarketData });
                dispatch({ type: "SET_MARKET_STATUS", missingFactors: missingFactorsEstimate, status: "loading" });
                setLocalLoading(true);
                window.setTimeout(() => {
                  dispatch({ type: "SET_MARKET_STATUS", missingFactors: 0, status: "ready" });
                  dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
                  setLocalLoading(false);
                }, 650);
              }}
            >
              Подтянуть рыночные данные
            </Button>
            <Button data-testid="go-configure" variant="secondary" disabled={!isReady} onClick={() => nav("/configure")}>
              Продолжить: настройки
            </Button>
          </div>
        </Card>

        <Card>
          <div className="cardTitle">Что это значит “по‑простому”</div>
          <ul className="stack" style={{ margin: 10, paddingLeft: 18 }}>
            <li>Опцион зависит от <strong>цены</strong> и <strong>волатильности</strong>.</li>
            <li>Форвард зависит от <strong>цены</strong> и (часто) от <strong>ставки</strong>.</li>
            <li>Процентный своп зависит от <strong>кривой ставок</strong> (движения на +1 б.п. → DV01).</li>
          </ul>
          <div className="textMuted">
            Если для сделки не нашли данные — это критично: расчёт будет неверным, поэтому шаг блокируется.
          </div>
        </Card>
      </div>
    </Card>
  );
}
