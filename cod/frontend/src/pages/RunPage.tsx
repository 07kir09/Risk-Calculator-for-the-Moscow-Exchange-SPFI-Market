import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import FormField from "../ui/FormField";
import PageHeader from "../ui/PageHeader";
import ResultPanel from "../ui/ResultPanel";
import SegmentedControl from "../ui/SegmentedControl";
import StatePanel from "../ui/StatePanel";
import { useToast } from "../ui/Toast";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { runRiskCalculation } from "../api/services/risk";
import { formatNumber } from "../utils/format";
import { pushRunSnapshot } from "../lib/scenarios";

export default function RunPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const { showToast } = useToast();

  const [errorText, setErrorText] = useState<string | null>(null);
  const [runScope, setRunScope] = useState<"portfolio" | "single">(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    return mode === "single" ? "single" : "portfolio";
  });
  const [singlePositionId, setSinglePositionId] = useState<string>("");

  const positions = dataState.portfolio.positions;
  const scenarios = dataState.scenarios;
  const selectedMetrics = wf.calcConfig.selectedMetrics;
  const alpha = Number(wf.calcConfig.params?.alpha ?? 0.99);
  const horizonDays = Number(wf.calcConfig.params?.horizonDays ?? 10);
  const baseCurrency = String(wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase();
  const fxRates = (wf.calcConfig.params?.fxRates as Record<string, number> | undefined) ?? undefined;
  const liquidityModel = String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value");

  useEffect(() => {
    if (!singlePositionId && positions.length > 0) {
      setSinglePositionId(positions[0].position_id);
    }
  }, [singlePositionId, positions]);

  useEffect(() => {
    const mode = new URLSearchParams(location.search).get("mode");
    if (mode === "single") setRunScope("single");
  }, [location.search]);

  const effectivePositions = useMemo(() => {
    if (runScope === "single" && singlePositionId) {
      return positions.filter((p) => p.position_id === singlePositionId);
    }
    return positions;
  }, [positions, runScope, singlePositionId]);

  const hasPreviousRun = Boolean(dataState.results.metrics);

  const canRun = useMemo(() => {
    return (
      effectivePositions.length > 0 &&
      wf.validation.criticalErrors === 0 &&
      wf.marketData.status === "ready" &&
      wf.marketData.missingFactors === 0 &&
      selectedMetrics.length > 0 &&
      Number.isFinite(alpha) &&
      Number.isFinite(horizonDays) &&
      horizonDays >= 1 &&
      /^[A-Z]{3}$/.test(baseCurrency)
    );
  }, [
    effectivePositions.length,
    wf.validation.criticalErrors,
    wf.marketData.status,
    wf.marketData.missingFactors,
    selectedMetrics.length,
    alpha,
    horizonDays,
    baseCurrency,
  ]);

  const isRunning = wf.calcRun.status === "running";

  return (
    <Card>
      <PageHeader
        kicker="Calculator / Run"
        title="Шаг 5. Запуск расчёта"
        subtitle="Проверьте сводку и нажмите «Запустить». Если параметры меняются на предыдущих шагах, результаты пересчитываются заново."
        actions={<Button variant="secondary" onClick={() => nav("/configure")}>Назад: настройки</Button>}
      />

      <StatePanel
        tone={isRunning ? "info" : errorText ? "error" : "success"}
        title={isRunning ? "Расчёт выполняется" : errorText ? "Расчёт завершился с ошибкой" : "Готово к запуску"}
        description={
          isRunning
            ? "Собираем метрики и обновляем панель риска."
            : errorText
              ? errorText
              : "Выберите режим запуска и проверьте сводку перед расчётом."
        }
      />

      <div className="grid" style={{ marginTop: 12 }}>
        <Card className="stickyActionCard">
          <div className="cardTitle">Сводка запуска</div>

          <div style={{ marginTop: 12 }}>
            <label className="label">Режим расчёта</label>
            <div style={{ marginTop: 6 }}>
              <SegmentedControl
                ariaLabel="Режим расчёта риска"
                value={runScope}
                onChange={setRunScope}
                options={[
                  { value: "portfolio", label: "Портфель" },
                  { value: "single", label: "Один инструмент", disabled: positions.length === 0 },
                ]}
              />
            </div>
          </div>

          {runScope === "single" && (
            <div style={{ marginTop: 12 }}>
              <FormField label="Позиция для single-run" helper="Выберите одну позицию для быстрого сценария.">
                <select value={singlePositionId} onChange={(e) => setSinglePositionId(e.target.value)}>
                  <option value="">Выберите позицию</option>
                  {positions.map((p) => (
                    <option key={p.position_id} value={p.position_id}>
                      {p.position_id} ({p.instrument_type})
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          )}

          <div className="stack" style={{ marginTop: 12 }}>
            <div>Сделок в расчёте: <span className="code">{effectivePositions.length}</span></div>
            <div>Сценариев: <span className="code">{scenarios.length}</span></div>
            <div>Метрик: <span className="code">{selectedMetrics.length}</span></div>
            <div>CL (alpha): <span className="code">{alpha}</span></div>
            <div>Горизонт: <span className="code">{horizonDays} дн.</span></div>
            <div>Базовая валюта: <span className="code">{baseCurrency}</span></div>
            <div>FX пар: <span className="code">{Object.keys(fxRates ?? {}).length}</span></div>
            <div>LC модель: <span className="code">{liquidityModel}</span></div>
            <div>Маржа/капитал: <span className="code">{wf.calcConfig.marginEnabled ? "включено" : "выключено"}</span></div>
          </div>

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
                const startedAt = new Date().toISOString();
                dispatch({ type: "SET_CALC_RUN", calcRunId, status: "running", startedAt });
                try {
                  const metrics = await runRiskCalculation({
                    positions: effectivePositions,
                    scenarios,
                    limits: dataState.limits ?? undefined,
                    alpha,
                    horizonDays,
                    baseCurrency,
                    fxRates,
                    liquidityModel,
                    selectedMetrics,
                    marginEnabled: wf.calcConfig.marginEnabled,
                  });
                  dataDispatch({ type: "SET_RESULTS", metrics });
                  pushRunSnapshot(metrics, {
                    calcRunId,
                    scope: runScope,
                    positionCount: effectivePositions.length,
                    baseCurrency,
                  });
                  dispatch({
                    type: "SET_CALC_RUN",
                    calcRunId,
                    status: "success",
                    startedAt,
                    finishedAt: new Date().toISOString(),
                  });
                  dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.CalcRun });
                  showToast("Расчёт завершён успешно", "success");
                  nav("/dashboard");
                } catch (e: any) {
                  const message = e?.message ?? "Ошибка расчёта";
                  dispatch({ type: "SET_CALC_RUN", calcRunId, status: "error", startedAt, finishedAt: new Date().toISOString() });
                  setErrorText(message);
                  showToast(message, "error");
                }
              }}
            >
              Запустить расчёт
            </Button>
            <Button variant="secondary" disabled={!hasPreviousRun} onClick={() => nav("/dashboard")}>
              Открыть результаты
            </Button>
          </div>

          {!canRun && (
            <div className="textMuted" style={{ marginTop: 10 }}>
              Кнопка станет доступна, когда: импорт сделок выполнен, критических ошибок нет, рыночные данные привязаны, и выбраны метрики.
            </div>
          )}
        </Card>

        <ResultPanel
          title="Что будет посчитано"
          subtitle="Список на основе выбранных метрик (без «лишнего»)."
          summary={
            <div className="stack">
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
          }
          details={
            hasPreviousRun ? (
              <Card style={{ marginTop: 12 }}>
                <div className="cardTitle">Последний результат (preview)</div>
                <div className="stack" style={{ marginTop: 10 }}>
                  <div>PV: <span className="code">{formatNumber(dataState.results.metrics?.base_value ?? 0)}</span></div>
                  <div>VaR: <span className="code">{formatNumber(dataState.results.metrics?.var_hist ?? 0)}</span></div>
                  <div>ES: <span className="code">{formatNumber(dataState.results.metrics?.es_hist ?? 0)}</span></div>
                </div>
              </Card>
            ) : undefined
          }
        />
      </div>
    </Card>
  );
}
