import { StressResult } from "../types";

interface Props {
  stress: StressResult[];
}

export default function StressTable({ stress }: Props) {
  if (!stress.length) return <p>Нет стресс-сценариев.</p>;
  return (
    <div>
      <h3>Стресс-сценарии</h3>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>PnL</th>
            <th>Лимит</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {stress.map((s) => (
            <tr key={s.scenario_id}>
              <td>{s.scenario_id}</td>
              <td>{s.pnl.toFixed(4)}</td>
              <td>{s.limit ?? "—"}</td>
              <td><span className={`badge ${s.breached ? "danger" : "ok"}`}>{s.breached ? "Превышен" : "Ок"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
