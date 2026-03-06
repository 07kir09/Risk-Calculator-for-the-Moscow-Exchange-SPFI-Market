import { useEffect, useMemo, useState } from "react";
import { useRiskStore } from "../app/store/useRiskStore";
import { mapScenarioResultRows } from "../features/calculations/resultMappers";
import { ScenarioBarChart } from "../charts/ScenarioBarChart";
import { ContributorsTable } from "../features/calculations/ContributorsTable";
import { formatPercentFromDecimal } from "../shared/formatters/numberFormat";

function contributorMetricLabel(metric: string): string {
  if (metric === "var_hist") return "Ист. VaR";
  if (metric === "es_hist") return "Ист. ES";
  if (metric === "stress") return "Стресс";
  return metric;
}

export function ScenarioRiskPage() {
  const scenarios = useRiskStore((state) => state.scenariosDraft);
  const result = useRiskStore((state) => state.calculationResult);
  const selectedScenarioId = useRiskStore((state) => state.selectedScenarioId);
  const setSelectedScenarioId = useRiskStore((state) => state.setSelectedScenarioId);
  const selectedMetric = useRiskStore((state) => state.selectedContributorMetric);
  const setSelectedMetric = useRiskStore((state) => state.setSelectedContributorMetric);
  const [selectedBucketGroup, setSelectedBucketGroup] = useState<string | null>(null);

  const rows = useMemo(
    () => mapScenarioResultRows(scenarios, result?.stress, result?.pnl_distribution),
    [result?.pnl_distribution, result?.stress, scenarios]
  );

  const selected = useMemo(
    () => rows.find((row) => row.scenario_id === selectedScenarioId) ?? rows[0],
    [rows, selectedScenarioId]
  );
  const bucketGroups = useMemo(() => Object.keys(result?.buckets ?? {}), [result?.buckets]);

  useEffect(() => {
    if (!bucketGroups.length) {
      setSelectedBucketGroup(null);
      return;
    }
    if (!selectedBucketGroup || !bucketGroups.includes(selectedBucketGroup)) {
      setSelectedBucketGroup(bucketGroups[0]);
    }
  }, [bucketGroups, selectedBucketGroup]);

  return (
    <div className="page-grid">
      <div className="grid-two-wide">
        <div className="panel panel-padded-12 stack-10">
          <h3 className="section-title">Распределение по сценариям</h3>
          <ScenarioBarChart
            rows={rows.map((row) => ({ scenario_id: row.scenario_id, pnl: row.pnl ?? 0, breached: row.breached }))}
            onSelect={setSelectedScenarioId}
          />
        </div>

        <div className="panel panel-padded-12 stack-8">
          <h3 className="section-title">Превью сценария</h3>
          {selected ? (
            <>
              <div className="small-muted">Сценарий: {selected.scenario_id}</div>
              <div className="small-muted">Сдвиг базового актива: {formatPercentFromDecimal(selected.underlying_shift)}</div>
              <div className="small-muted">Сдвиг волатильности: {formatPercentFromDecimal(selected.volatility_shift)}</div>
              <div className="small-muted">Сдвиг ставки: {formatPercentFromDecimal(selected.rate_shift)}</div>
              <div className="small-muted">PnL: {selected.pnl ?? "-"}</div>
              <div>{selected.breached ? <span className="badge badge-red">Лимит нарушен</span> : <span className="badge badge-green">В пределах лимита</span>}</div>
            </>
          ) : (
            <div className="small-muted">Нет данных по сценариям</div>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID сценария</th>
              <th>Сдвиг базового</th>
              <th>Сдвиг волатильности</th>
              <th>Сдвиг ставки</th>
              <th>Вероятность</th>
              <th>PnL</th>
              <th>Лимит</th>
              <th>Нарушение</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={8}>Сценарии отсутствуют. Загрузите дефолтные или добавьте вручную.</td>
              </tr>
            ) : null}

            {rows.map((row) => (
              <tr
                key={row.scenario_id}
                onClick={() => setSelectedScenarioId(row.scenario_id)}
                className="row-clickable"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedScenarioId(row.scenario_id);
                  }
                }}
                title={`Выбрать сценарий ${row.scenario_id}`}
              >
                <td title={row.scenario_id}><span className="numeric-value">{row.scenario_id}</span></td>
                <td title={formatPercentFromDecimal(row.underlying_shift)}><span className="numeric-value">{formatPercentFromDecimal(row.underlying_shift)}</span></td>
                <td title={formatPercentFromDecimal(row.volatility_shift)}><span className="numeric-value">{formatPercentFromDecimal(row.volatility_shift)}</span></td>
                <td title={formatPercentFromDecimal(row.rate_shift)}><span className="numeric-value">{formatPercentFromDecimal(row.rate_shift)}</span></td>
                <td title={row.probability === null || row.probability === undefined ? "-" : String(row.probability)}><span className="numeric-value">{row.probability ?? "-"}</span></td>
                <td title={row.pnl === null || row.pnl === undefined ? "-" : String(row.pnl)}><span className="numeric-value">{row.pnl ?? "-"}</span></td>
                <td title={row.limit === null || row.limit === undefined ? "-" : String(row.limit)}><span className="numeric-value">{row.limit ?? "-"}</span></td>
                <td>{row.breached ? <span className="badge badge-red">да</span> : <span className="badge badge-green">нет</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel panel-padded-12 stack-8">
        <div className="filters-compact">
          <span className="filters-compact-title">Метрика:</span>
          <button className={`filter-chip${selectedMetric === "var_hist" ? " filter-chip-active" : ""}`} onClick={() => setSelectedMetric("var_hist")}>Ист. VaR</button>
          <button className={`filter-chip${selectedMetric === "es_hist" ? " filter-chip-active" : ""}`} onClick={() => setSelectedMetric("es_hist")}>Ист. ES</button>
          <button className={`filter-chip${selectedMetric === "stress" ? " filter-chip-active" : ""}`} onClick={() => setSelectedMetric("stress")}>Стресс</button>
          <span className="filter-stat">выбрано: {contributorMetricLabel(selectedMetric)}</span>
          <span className="filter-stat">сценарий: {selected?.scenario_id ?? "-"}</span>
        </div>
        <ContributorsTable metric={selectedMetric} />
      </div>

      <div className="panel panel-padded-12 stack-8">
        <h3 className="section-title">Бакеты</h3>
        {!result?.buckets ? (
          <div className="small-muted">Данные по бакетам отсутствуют.</div>
        ) : (
          <div className="grid-two-buckets">
            <div className="panel panel-padded-8 stack-6 align-start">
              {bucketGroups.map((group) => (
                <button
                  key={group}
                  className={`filter-chip${selectedBucketGroup === group ? " filter-chip-active" : ""}`}
                  onClick={() => setSelectedBucketGroup(group)}
                >
                  {group}
                </button>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Группа</th>
                    <th>Метрика</th>
                    <th>Значение</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.buckets[selectedBucketGroup ?? bucketGroups[0]] ?? {}).map(([metric, value]) => (
                    <tr key={`${selectedBucketGroup}-${metric}`}>
                      <td title={selectedBucketGroup ?? "-"}><span className="numeric-value">{selectedBucketGroup}</span></td>
                      <td title={metric}><span className="numeric-value">{metric}</span></td>
                      <td title={String(value)}><span className="numeric-value">{value}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
