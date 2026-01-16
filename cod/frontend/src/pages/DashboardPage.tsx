import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import HelpTooltip from "../components/HelpTooltip";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { state: dataState } = useAppData();
  const { dispatch } = useWorkflow();
  const m = dataState.results.metrics;

  useEffect(() => {
    if (m) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
  }, [m, dispatch]);

  const worstStress = useMemo(() => {
    if (!m?.stress?.length) return undefined;
    return Math.min(...m.stress.map((s) => s.pnl));
  }, [m]);

  if (!m) {
    return (
      <Card>
        <h1 className="pageTitle">Шаг 6. Панель риска</h1>
        <p className="pageHint">Пока нет результатов. Сначала запустите расчёт, и здесь появятся метрики и графики.</p>
        <Button onClick={() => navigate("/run")}>Перейти к запуску</Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 6. Панель риска</h1>
          <p className="pageHint">Главный экран: где риск и за счёт чего. Детали — через «Стрессы» и «Лимиты».</p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => navigate("/stress")}>Открыть стрессы</Button>
          <Button variant="secondary" onClick={() => navigate("/limits")}>Открыть лимиты</Button>
          <Button variant="secondary" onClick={() => navigate("/export")}>Экспорт</Button>
        </div>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <KPI label="Стоимость портфеля" value={m.base_value} tooltip="Суммарная стоимость (PV/price) по выбранной модели." />
        <KPI label="VaR (hist)" value={m.var_hist} tooltip="Потенциальный убыток при доверии alpha по историческому методу." />
        <KPI label="ES (hist)" value={m.es_hist} tooltip="Средний убыток в худших случаях (хвост распределения)." />
        <KPI label="LC VaR" value={m.lc_var} tooltip="VaR с надбавкой за ликвидность." />
        <KPI label="Худший стресс P&L" value={worstStress} tooltip="Минимальный P&L среди выбранных стресс‑сценариев." />
        <KPI label="Initial Margin" value={m.initial_margin} tooltip="Оценка требуемой маржи (демо)." />
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <Card>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <div className="cardTitle">
              Чувствительности (Greeks) <HelpTooltip text="Показывают, что сильнее всего влияет на стоимость: цена, вола, ставка. DV01 — чувствительность к +1 б.п." />
            </div>
          </div>
          <div className="row wrap" style={{ marginTop: 12 }}>
            {m.greeks &&
              Object.entries(m.greeks).map(([k, v]) => (
                <span key={k} className="badge ok" title={String(v)}>
                  {k.toUpperCase()}: {formatNumber(v, 4)}
                </span>
              ))}
            {!m.greeks && <span className="textMuted">Не считали Greeks (включите в настройках).</span>}
          </div>
        </Card>

        <Card>
          <div className="cardTitle">Fact vs Limit (сводно)</div>
          <div className="cardSubtitle">Подробности — в разделе «Лимиты».</div>
          <div className="stack" style={{ marginTop: 12 }}>
            {(m.limits ?? []).slice(0, 6).map(([metric, value, limit, breached]) => (
              <div key={metric} className={breached ? "badge danger" : "badge ok"} title={String(value)}>
                {metric}: {formatNumber(value)} / лимит {limit}
              </div>
            ))}
            {!m.limits?.length && <div className="textMuted">Лимитов нет (или не переданы).</div>}
          </div>
        </Card>
      </div>
    </Card>
  );
}

function KPI({ label, value, tooltip }: { label: string; value?: number; tooltip?: string }) {
  return (
    <Card>
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <div className="textMuted">
          {label} {tooltip && <HelpTooltip text={tooltip} />}
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, marginTop: 10 }} title={value !== undefined ? String(value) : undefined}>
        {value !== undefined ? formatNumber(value) : "—"}
      </div>
    </Card>
  );
}
