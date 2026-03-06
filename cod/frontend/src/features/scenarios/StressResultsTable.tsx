import { formatNumber } from "../../shared/formatters/numberFormat";

type StressResultsTableProps = {
  rows: Array<{
    scenario_id: string;
    pnl: number | null;
    limit: number | null;
    breached: boolean;
  }>;
  onSelect?: (scenarioId: string) => void;
};

export function StressResultsTable({ rows, onSelect }: StressResultsTableProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Сценарий</th>
            <th>PnL</th>
            <th>Лимит</th>
            <th>Нарушение</th>
            <th>Ранг по убытку</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={5}>Результаты стресс-теста появятся после расчёта со включёнными сценариями.</td>
            </tr>
          ) : null}
          {[...rows]
            .sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0))
            .map((row, index) => (
              <tr
                key={row.scenario_id}
                onClick={() => onSelect?.(row.scenario_id)}
                className="row-clickable"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect?.(row.scenario_id);
                  }
                }}
                title={`Выбрать сценарий ${row.scenario_id}`}
              >
                <td title={row.scenario_id}><span className="numeric-value">{row.scenario_id}</span></td>
                <td title={row.pnl === null ? "-" : formatNumber(row.pnl, 4)}><span className="numeric-value">{row.pnl === null ? "-" : formatNumber(row.pnl, 4)}</span></td>
                <td title={row.limit === null ? "-" : String(row.limit)}><span className="numeric-value">{row.limit ?? "-"}</span></td>
                <td>{row.breached ? <span className="badge badge-red">Лимит нарушен</span> : <span className="badge badge-green">В пределах лимита</span>}</td>
                <td title={String(index + 1)}><span className="numeric-value">{index + 1}</span></td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
