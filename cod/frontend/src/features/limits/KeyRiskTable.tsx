import { mapKeyRiskRows } from "../calculations/resultMappers";
import { useRiskStore } from "../../app/store/useRiskStore";
import { formatCurrency, formatNullable } from "../../shared/formatters/numberFormat";
import { TableCard } from "../../widgets/table-card/TableCard";

export function KeyRiskTable() {
  const result = useRiskStore((state) => state.calculationResult);
  const rows = mapKeyRiskRows(result);
  const currency = result?.base_currency ?? "RUB";

  return (
    <TableCard title="Ключевые риск-метрики">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Метрика</th>
              <th>Значение</th>
              <th>Ед. изм. / Валюта</th>
              <th>Лимит</th>
              <th>Нарушение</th>
              <th>Примечание</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={6}>Пока нет результатов расчёта.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.metric}>
                <td title={row.metric}><span className="numeric-value">{row.metric}</span></td>
                <td title={typeof row.value === "number" ? formatCurrency(row.value, currency) : "-"}><span className="numeric-value">{typeof row.value === "number" ? formatCurrency(row.value, currency) : "-"}</span></td>
                <td title={currency}><span className="numeric-value">{currency}</span></td>
                <td title={formatNullable(row.limit)}><span className="numeric-value">{formatNullable(row.limit)}</span></td>
                <td>{row.breached ? <span className="badge badge-red">да</span> : <span className="badge badge-green">нет</span>}</td>
                <td title={row.notes ?? "-"}><span className="numeric-value">{row.notes ?? "-"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TableCard>
  );
}
