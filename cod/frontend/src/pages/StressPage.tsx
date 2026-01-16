import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { runRiskCalculation } from "../api/services/risk";

export default function StressPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const metrics = dataState.results.metrics;
  const stress = metrics?.stress || [];
  const [status, setStatus] = useState<string>("");
  const [isRecalc, setIsRecalc] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Stress });
  }, [metrics, dispatch]);

  const worst = useMemo(() => (stress.length ? Math.min(...stress.map((s) => s.pnl)) : undefined), [stress]);

  const [draftId, setDraftId] = useState("custom");
  const [draftS, setDraftS] = useState(0);
  const [draftVol, setDraftVol] = useState(0);
  const [draftR, setDraftR] = useState(0);
  const [draftDesc, setDraftDesc] = useState("Пользовательский сценарий");

  const alpha = Number(wf.calcConfig.params?.alpha ?? 0.99);
  const selectedMetrics = wf.calcConfig.selectedMetrics;

  const recalcNow = async () => {
    setStatus("");
    setIsRecalc(true);
    const calcRunId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    dispatch({ type: "SET_CALC_RUN", calcRunId, status: "running", startedAt });
    try {
      const updated = await runRiskCalculation({
        positions: dataState.portfolio.positions,
        scenarios: dataState.scenarios,
        limits: dataState.limits ?? undefined,
        alpha,
        selectedMetrics,
        marginEnabled: wf.calcConfig.marginEnabled,
      });
      dataDispatch({ type: "SET_RESULTS", metrics: updated });
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "success", startedAt, finishedAt: new Date().toISOString() });
      setStatus("Готово: результаты обновлены.");
    } catch (e: any) {
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "error", startedAt, finishedAt: new Date().toISOString() });
      setStatus(e?.message ?? "Ошибка пересчёта");
    } finally {
      setIsRecalc(false);
    }
  };

  const handleCreate = () => {
    if (!draftId.trim()) return;
    dataDispatch({
      type: "SET_SCENARIOS",
      scenarios: [
        ...dataState.scenarios.filter((s) => s.scenario_id !== draftId.trim()),
        { scenario_id: draftId.trim(), underlying_shift: draftS, volatility_shift: draftVol, rate_shift: draftR, description: draftDesc },
      ],
    });
    setStatus("Сценарий добавлен. Нажмите «Обновить результаты», чтобы увидеть новый P&L.");
  };

  const removeScenario = (id: string) => {
    dataDispatch({ type: "SET_SCENARIOS", scenarios: dataState.scenarios.filter((s) => s.scenario_id !== id) });
    setStatus("Сценарий удалён. Нажмите «Обновить результаты», чтобы пересчитать P&L.");
  };
  return (
    <Card>
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Удалить сценарий?"
        description={
          <div className="stack">
            <div>
              Сценарий <span className="code">{confirmDelete ?? ""}</span> будет удалён.
            </div>
            <div className="textMuted">Чтобы обновить результаты стрессов, нужно пересчитать.</div>
          </div>
        }
        confirmText="Удалить"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeScenario(confirmDelete);
          setConfirmDelete(null);
        }}
      />

      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 7. Стресс‑сценарии</h1>
          <p className="pageHint">Ответ: что будет при плохих сценариях. Здесь можно управлять сценариями и смотреть stress P&L.</p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/dashboard")}>Назад: панель</Button>
          <Button data-testid="refresh-results" variant="secondary" loading={isRecalc} disabled={!metrics || isRecalc} onClick={recalcNow}>Обновить результаты</Button>
        </div>
      </div>

      {!metrics ? (
        <Card>
          <div className="badge warn">Нет результатов. Сначала запустите расчёт.</div>
          <Button onClick={() => nav("/run")}>Перейти к запуску</Button>
        </Card>
      ) : (
        <div className="grid" style={{ marginTop: 12 }}>
          <Card>
            <div className="cardTitle">Результаты стрессов</div>
            <div className="cardSubtitle">Худший stress P&L: {worst !== undefined ? formatNumber(worst) : "—"}</div>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table sticky">
                <thead>
                  <tr>
                    <th>Сценарий</th>
                    <th>P&L</th>
                    <th>Лимит</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {stress.map((s) => (
                    <tr key={s.scenario_id}>
                      <td>{s.scenario_id}</td>
                      <td>{formatNumber(s.pnl)}</td>
                      <td>{s.limit ?? "—"}</td>
                      <td>
                        <span className={s.breached ? "badge danger" : "badge ok"}>{s.breached ? "Превышен" : "Ок"}</span>
                      </td>
                    </tr>
                  ))}
                  {stress.length === 0 && (
                    <tr>
                      <td colSpan={4} className="textMuted">Стрессы не считались (включите «Стресс‑сценарии» в настройках).</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => nav("/limits")}>Перейти к лимитам</Button>
            </div>
            {status && <div className="badge ok" style={{ marginTop: 12 }}>{status}</div>}

            <Card style={{ marginTop: 12 }}>
              <div className="cardTitle">Топ‑вкладчики (демо)</div>
              <div className="cardSubtitle">Пока нет разложений по сделкам, показываем “прокси” по чувствительностям.</div>
              <div className="row wrap" style={{ marginTop: 12 }}>
                {Object.entries(metrics?.greeks ?? {})
                  .slice(0, 6)
                  .map(([k, v]) => (
                    <span key={k} className="badge warn" title={String(v)}>
                      {k.toUpperCase()}: {formatNumber(v, 4)}
                    </span>
                  ))}
                {!Object.keys(metrics?.greeks ?? {}).length && <span className="textMuted">Нет Greeks — включите в настройках.</span>}
              </div>
            </Card>
          </Card>

          <Card>
            <div className="cardTitle">Каталог сценариев</div>
            <div className="cardSubtitle">Шок по цене/волатильности/ставке. Пример: -0.10 = падение цены на 10%.</div>

            <div className="stack" style={{ marginTop: 12 }}>
              <label>
                ID сценария
                <input value={draftId} onChange={(e) => setDraftId(e.target.value)} />
              </label>
              <div className="grid">
                <label>
                  ΔS (underlying_shift)
                  <input type="number" step="0.01" value={draftS} onChange={(e) => setDraftS(Number(e.target.value))} />
                </label>
                <label>
                  ΔVol (volatility_shift)
                  <input type="number" step="0.01" value={draftVol} onChange={(e) => setDraftVol(Number(e.target.value))} />
                </label>
                <label>
                  Δr (rate_shift)
                  <input type="number" step="0.001" value={draftR} onChange={(e) => setDraftR(Number(e.target.value))} />
                </label>
              </div>
              <label>
                Описание
                <input value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} />
              </label>
              <div className="row wrap">
                <Button variant="secondary" onClick={handleCreate}>Добавить/обновить сценарий</Button>
              </div>
            </div>

            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table sticky">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>ΔS</th>
                    <th>ΔVol</th>
                    <th>Δr</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dataState.scenarios.map((s) => (
                    <tr key={s.scenario_id}>
                      <td title={s.description ?? ""}>{s.scenario_id}</td>
                      <td>{s.underlying_shift}</td>
                      <td>{s.volatility_shift}</td>
                      <td>{s.rate_shift}</td>
                      <td>
                        <Button variant="secondary" onClick={() => setConfirmDelete(s.scenario_id)}>Удалить</Button>
                      </td>
                    </tr>
                  ))}
                  {dataState.scenarios.length === 0 && (
                    <tr>
                      <td colSpan={5} className="textMuted">Сценариев нет. Добавьте сверху или вернитесь в настройки.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
