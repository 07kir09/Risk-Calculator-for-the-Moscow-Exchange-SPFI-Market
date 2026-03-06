import { useMemo, useState } from "react";
import { useRiskStore } from "../app/store/useRiskStore";
import { mapScenarioResultRows } from "../features/calculations/resultMappers";
import { ScenarioBarChart } from "../charts/ScenarioBarChart";
import { StressResultsTable } from "../features/scenarios/StressResultsTable";
import { ScenarioDraft } from "../shared/types/contracts";
import { BaseStressComparisonChart } from "../charts/BaseStressComparisonChart";

export function StressTestingPage() {
  const scenarios = useRiskStore((state) => state.scenariosDraft);
  const addScenario = useRiskStore((state) => state.addScenario);
  const result = useRiskStore((state) => state.calculationResult);
  const selectedScenarioId = useRiskStore((state) => state.selectedScenarioId);
  const setSelectedScenarioId = useRiskStore((state) => state.setSelectedScenarioId);

  const rows = useMemo(
    () => mapScenarioResultRows(scenarios, result?.stress, result?.pnl_distribution),
    [result?.pnl_distribution, result?.stress, scenarios]
  );

  const [tempScenario, setTempScenario] = useState<ScenarioDraft>({
    scenario_id: `tmp_${Date.now()}`,
    underlying_shift: 0,
    volatility_shift: 0,
    rate_shift: 0,
    probability: null,
  });
  const [temporaryApplied, setTemporaryApplied] = useState(false);

  const displayRows = useMemo(() => {
    if (!temporaryApplied) {
      return rows;
    }
    return [
      ...rows,
      {
        scenario_id: tempScenario.scenario_id,
        underlying_shift: tempScenario.underlying_shift ?? 0,
        volatility_shift: tempScenario.volatility_shift ?? 0,
        rate_shift: tempScenario.rate_shift ?? 0,
        probability: tempScenario.probability,
        pnl: null,
        limit: null,
        breached: false,
      },
    ];
  }, [rows, tempScenario, temporaryApplied]);

  const selected = displayRows.find((row) => row.scenario_id === selectedScenarioId) ?? displayRows[0] ?? null;

  function applyTemporary() {
    setTemporaryApplied(true);
    setSelectedScenarioId(tempScenario.scenario_id);
  }

  function saveScenario() {
    addScenario({ ...tempScenario, scenario_id: tempScenario.scenario_id || `scenario_${Date.now()}` });
    setTemporaryApplied(false);
  }

  return (
    <div className="page-grid">
      <div className="grid-two-main">
        <div className="panel panel-padded-12 stack-10">
          <h3 className="section-title">Оценка потерь</h3>
          <BaseStressComparisonChart
            baseValues={result?.pnl_distribution}
            selected={
              selected
                ? {
                    scenario_id: selected.scenario_id,
                    underlying_shift: selected.underlying_shift,
                    volatility_shift: selected.volatility_shift,
                    rate_shift: selected.rate_shift,
                    pnl: selected.pnl,
                  }
                : null
            }
          />
          <ScenarioBarChart
            rows={displayRows.map((row) => ({ scenario_id: row.scenario_id, pnl: row.pnl ?? 0, breached: row.breached }))}
            onSelect={setSelectedScenarioId}
          />
          <div className="small-muted">Выбранный сценарий: {selected?.scenario_id ?? "-"}</div>
        </div>

        <div className="panel panel-padded-12 stack-8 align-start">
          <h3 className="section-title">Конструктор сценария</h3>

          <label className="field">
            <span className="field-label">Список сценариев</span>
            <select
              className="select"
              value={selectedScenarioId ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                if (value) {
                  setTemporaryApplied(false);
                  setSelectedScenarioId(value);
                }
              }}
            >
              <option value="">-- выбрать --</option>
              {rows.map((row) => (
                <option key={row.scenario_id} value={row.scenario_id}>
                  {row.scenario_id}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Имя сценария</span>
            <input className="control" value={tempScenario.scenario_id} onChange={(event) => setTempScenario((prev) => ({ ...prev, scenario_id: event.target.value }))} />
          </label>

          <label className="field">
            <span className="field-label">Сдвиг базового актива</span>
            <input className="control" type="number" step="0.0001" value={tempScenario.underlying_shift ?? 0} onChange={(event) => setTempScenario((prev) => ({ ...prev, underlying_shift: Number(event.target.value) }))} />
          </label>

          <label className="field">
            <span className="field-label">Сдвиг волатильности</span>
            <input className="control" type="number" step="0.0001" value={tempScenario.volatility_shift ?? 0} onChange={(event) => setTempScenario((prev) => ({ ...prev, volatility_shift: Number(event.target.value) }))} />
          </label>

          <label className="field">
            <span className="field-label">Сдвиг ставки</span>
            <input className="control" type="number" step="0.0001" value={tempScenario.rate_shift ?? 0} onChange={(event) => setTempScenario((prev) => ({ ...prev, rate_shift: Number(event.target.value) }))} />
          </label>

          <label className="field">
            <span className="field-label">Вероятность</span>
            <input className="control" type="number" step="0.0001" value={tempScenario.probability ?? ""} onChange={(event) => setTempScenario((prev) => ({ ...prev, probability: event.target.value === "" ? null : Number(event.target.value) }))} />
          </label>

          <button className="btn" onClick={applyTemporary}>Применить как временный</button>
          <button className="btn btn-primary" onClick={saveScenario}>Сохранить сценарий</button>
          {temporaryApplied ? <div className="small-muted">Временный режим: только превью до сохранения.</div> : null}

          {selected ? (
            <div className="flex-row gap-6 wrap">
              <span className="badge">{selected.pnl !== null && selected.pnl < 0 ? "Убыток" : "Прибыль"}</span>
              <span className={`badge ${selected.breached ? "badge-red" : "badge-green"}`}>{selected.breached ? "Лимит нарушен" : "В пределах лимита"}</span>
              <span className="badge">|PnL|: {Math.abs(selected.pnl ?? 0).toFixed(2)}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel panel-padded-12 stack-8">
        <h3 className="section-title">Таблица потерь</h3>
        <StressResultsTable
          rows={displayRows.map((row) => ({
            scenario_id: row.scenario_id,
            pnl: row.pnl,
            limit: row.limit,
            breached: row.breached,
          }))}
          onSelect={setSelectedScenarioId}
        />
      </div>
    </div>
  );
}
