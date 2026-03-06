import { ContributorMetric } from "../../shared/types/contracts";
import { useRiskStore } from "../../app/store/useRiskStore";
import { formatNumber } from "../../shared/formatters/numberFormat";
import { TopContributorRow } from "../../shared/types/contracts";

type ContributorsTableProps = {
  metric: ContributorMetric;
};

const EMPTY_ROWS: TopContributorRow[] = [];

export function ContributorsTable({ metric }: ContributorsTableProps) {
  const calculationResult = useRiskStore((state) => state.calculationResult);
  const rows = calculationResult?.top_contributors?.[metric] ?? EMPTY_ROWS;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID позиции</th>
            <th>Вклад в PnL</th>
            <th>Абс. вклад в PnL</th>
            <th>ID сценария</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length ? (
            <tr>
              <td colSpan={4}>Нет данных по контрибьюторам.</td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={`${row.position_id}-${row.metric}-${row.scenario_id ?? "-"}`}>
              <td title={row.position_id}><span className="numeric-value">{row.position_id}</span></td>
              <td title={formatNumber(row.pnl_contribution, 4)}><span className="numeric-value">{formatNumber(row.pnl_contribution, 4)}</span></td>
              <td title={formatNumber(row.abs_pnl_contribution, 4)}><span className="numeric-value">{formatNumber(row.abs_pnl_contribution, 4)}</span></td>
              <td title={row.scenario_id ?? "-"}><span className="numeric-value">{row.scenario_id ?? "-"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
