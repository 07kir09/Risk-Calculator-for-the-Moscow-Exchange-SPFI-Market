import { useDefaultLimitsQuery } from "../../shared/api/hooks";
import { useRiskStore } from "../../app/store/useRiskStore";

const numericFields = ["var_hist", "es_hist", "var_param", "es_param", "lc_var"] as const;

export function LimitsEditor() {
  const limits = useRiskStore((state) => state.limitsDraft);
  const setLimits = useRiskStore((state) => state.setLimitsDraft);
  const clearLimits = useRiskStore((state) => state.clearLimits);
  const loadDefaultLimits = useRiskStore((state) => state.loadDefaultLimits);

  const { data } = useDefaultLimitsQuery();

  const current = limits ?? {};
  const stressMap = current.stress ?? {};

  function updateField(field: string, value: number) {
    setLimits({ ...current, [field]: value });
  }

  function updateStressField(scenarioId: string, value: number) {
    setLimits({
      ...current,
      stress: {
        ...stressMap,
        [scenarioId]: value,
      },
    });
  }

  return (
    <div className="panel panel-padded-12 stack-10">
      <div className="flex-row gap-8 wrap">
        <button className="btn" onClick={() => loadDefaultLimits(data?.data ?? {})}>Загрузить дефолтные</button>
        <button className="btn" onClick={clearLimits}>Очистить лимиты</button>
      </div>

      {!limits ? <div className="small-muted">Лимиты не заданы. Расчёт всё равно доступен.</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Метрика</th>
              <th>Значение лимита</th>
            </tr>
          </thead>
          <tbody>
            {numericFields.map((field) => (
              <tr key={field}>
                <td>{field}</td>
                <td>
                  <input
                    className="control"
                    type="number"
                    value={current[field] ?? ""}
                    onChange={(event) => updateField(field, Number(event.target.value))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel panel-padded-10 stack-8">
        <h4 className="section-title">Стресс-лимиты по сценариям</h4>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID сценария</th>
                <th>Лимит</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(stressMap).length === 0 ? (
                <tr>
                  <td colSpan={2}>Стресс-лимитов пока нет.</td>
                </tr>
              ) : null}
              {Object.entries(stressMap).map(([scenarioId, value]) => (
                <tr key={scenarioId}>
                  <td>{scenarioId}</td>
                  <td>
                    <input
                      className="control"
                      type="number"
                      value={String(value)}
                      onChange={(event) => updateStressField(scenarioId, Number(event.target.value))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
