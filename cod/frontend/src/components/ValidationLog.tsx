import { ValidationMessage } from "../types";

interface Props {
  log: ValidationMessage[];
}

export default function ValidationLog({ log }: Props) {
  if (!log.length) return <p>Ошибки импорта не найдены.</p>;
  return (
    <div>
      <h3>Журнал валидации</h3>
      <table className="table">
        <thead>
          <tr><th>Уровень</th><th>Строка</th><th>Сообщение</th></tr>
        </thead>
        <tbody>
          {log.map((m, idx) => (
            <tr key={idx}>
              <td>{m.severity}</td>
              <td>{m.row ?? "—"}</td>
              <td>{m.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
