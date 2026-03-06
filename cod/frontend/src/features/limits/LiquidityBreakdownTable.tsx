import { useRiskStore } from "../../app/store/useRiskStore";
import { formatCurrency } from "../../shared/formatters/numberFormat";
import { TableCard } from "../../widgets/table-card/TableCard";

export function LiquidityBreakdownTable() {
  const result = useRiskStore((state) => state.calculationResult);
  const rows = result?.lc_var_breakdown ?? [];
  const currency = result?.base_currency ?? "RUB";

  if (!rows.length) {
    return <div className="small-muted">Разбивка ликвидности недоступна для текущего прогона.</div>;
  }

  return (
    <TableCard title="Разбивка ликвидности">
      <div className="flex-row gap-8 align-center wrap">
        <span className="badge" title={`LC VaR надбавка: ${formatCurrency(result?.lc_var_addon ?? null, currency)}`}>LC VaR надбавка: {formatCurrency(result?.lc_var_addon ?? null, currency)}</span>
        <span className="badge" title={`LC VaR итоговый: ${formatCurrency(result?.lc_var ?? null, currency)}`}>LC VaR итоговый: {formatCurrency(result?.lc_var ?? null, currency)}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID позиции</th>
              <th>Модель</th>
              <th>Количество</th>
              <th>Стоимость позиции</th>
              <th>Входной дисконт (haircut)</th>
              <th>Надбавка в деньгах</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.position_id}-${row.model}`}>
                <td title={row.position_id}><span className="numeric-value">{row.position_id}</span></td>
                <td title={row.model}><span className="numeric-value">{row.model}</span></td>
                <td title={String(row.quantity)}><span className="numeric-value">{row.quantity}</span></td>
                <td title={formatCurrency(row.position_value, currency)}><span className="numeric-value">{formatCurrency(row.position_value, currency)}</span></td>
                <td title={String(row.haircut_input)}><span className="numeric-value">{row.haircut_input}</span></td>
                <td title={formatCurrency(row.add_on_money, currency)}><span className="numeric-value">{formatCurrency(row.add_on_money, currency)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableCard>
  );
}
