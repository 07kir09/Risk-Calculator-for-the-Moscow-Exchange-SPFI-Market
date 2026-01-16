import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { runRiskCalculation } from "../api/services/risk";

export default function RunPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const [errorText, setErrorText] = useState<string | null>(null);

  const positions = dataState.portfolio.positions;
  const scenarios = dataState.scenarios;
  const selectedMetrics = wf.calcConfig.selectedMetrics;
  const alpha = Number(wf.calcConfig.params?.alpha ?? 0.99);

  const canRun = useMemo(() => {
    return (
      positions.length > 0 &&
      wf.validation.criticalErrors === 0 &&
      wf.marketData.status === "ready" &&
      wf.marketData.missingFactors === 0 &&
      selectedMetrics.length > 0 &&
      Number.isFinite(alpha)
    );
  }, [positions.length, wf.validation.criticalErrors, wf.marketData.status, wf.marketData.missingFactors, selectedMetrics.length, alpha]);

  const isRunning = wf.calcRun.status === "running";

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 5. Запуск расчёта</h1>
          <p className="pageHint">
            Проверьте сводку и нажмите «Запустить». Если что‑то измените на прошлых шагах — результаты будут автоматически сброшены.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/configure")}>
            Назад: настройки
          </Button>
        </div>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <Card>
          <div className="cardTitle">Сводка</div>
          <div className="stack" style={{ marginTop: 12 }}>
            <div>Сделок: <span className="code">{positions.length}</span></div>
            <div>Сценариев: <span className="code">{scenarios.length}</span></div>
            <div>Метрик: <span className="code">{selectedMetrics.length}</span></div>
            <div>alpha: <span className="code">{alpha}</span></div>
            <div>Маржа/капитал: <span className="code">{wf.calcConfig.marginEnabled ? "включено" : "выключено"}</span></div>
          </div>
          {errorText && (
            <div style={{ marginTop: 12 }} className="badge danger">
              {errorText}
            </div>
          )}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <Button
              data-testid="run-calc"
              disabled={!canRun || isRunning}
              loading={isRunning}
              onClick={async () => {
                setErrorText(null);
                dataDispatch({ type: "RESET_RESULTS" });
                dispatch({ type: "RESET_DOWNSTREAM", fromStep: WorkflowStep.CalcRun });
                const calcRunId = crypto.randomUUID();
                dispatch({ type: "SET_CALC_RUN", calcRunId, status: "running", startedAt: new Date().toISOString() });
                try {
                  const metrics = await runRiskCalculation({
                    positions,
                    scenarios,
                    limits: dataState.limits ?? undefined,
                    alpha,
                    selectedMetrics,
                    marginEnabled: wf.calcConfig.marginEnabled,
                  });
                  dataDispatch({ type: "SET_RESULTS", metrics });
                  dispatch({
                    type: "SET_CALC_RUN",
                    calcRunId,
                    status: "success",
                    startedAt: wf.calcRun.startedAt ?? new Date().toISOString(),
                    finishedAt: new Date().toISOString(),
                  });
                  dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.CalcRun });
                  nav("/dashboard");
                } catch (e: any) {
                  dispatch({ type: "SET_CALC_RUN", calcRunId, status: "error", startedAt: wf.calcRun.startedAt, finishedAt: new Date().toISOString() });
                  setErrorText(e?.message ?? "Ошибка расчёта");
                }
              }}
            >
              Запустить расчёт
            </Button>
            <Button variant="secondary" disabled={!dataState.results.metrics} onClick={() => nav("/dashboard")}>
              Открыть результаты
            </Button>
          </div>
          {!canRun && (
            <div className="textMuted" style={{ marginTop: 10 }}>
              Кнопка станет доступна, когда: импорт сделок выполнен, критических ошибок нет, рыночные данные привязаны, и выбраны метрики.
            </div>
          )}
        </Card>

        <Card>
          <div className="cardTitle">Что будет посчитано</div>
          <div className="cardSubtitle">Список на основе выбранных метрик (без “лишнего”).</div>
          <div className="stack" style={{ marginTop: 12 }}>
            {selectedMetrics.length === 0 ? (
              <div className="textMuted">Пока ничего не выбрано — вернитесь на шаг «Настройки».</div>
            ) : (
              selectedMetrics.map((m) => (
                <div key={m} className="badge ok">
                  {m}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </Card>
  );
}
