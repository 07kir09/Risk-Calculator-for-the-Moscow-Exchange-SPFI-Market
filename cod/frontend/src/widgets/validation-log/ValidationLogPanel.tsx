import { useMemo } from "react";
import { useRiskStore } from "../../app/store/useRiskStore";

export function ValidationLogPanel() {
  const result = useRiskStore((state) => state.calculationResult);

  const rows = useMemo(() => {
    const log = result?.validation_log ?? [];
    const order = { ERROR: 0, WARNING: 1, INFO: 2 } as const;
    return [...log].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [result]);

  if (!result) {
    return (
      <div className="panel panel-padded-12">
        <h3 className="section-title">Валидация</h3>
        <p className="small-muted">Пока нет результатов расчёта. Добавьте позиции и запустите расчёт.</p>
      </div>
    );
  }

  return (
    <div className="panel panel-padded-12 stack-8">
      <h3 className="section-title">Журнал валидации</h3>
      {result.fx_warning ? <div className="badge badge-warning">Предупреждение FX: {result.fx_warning}</div> : null}
      {result.methodology_note ? <div className="badge">Методологическая заметка: {result.methodology_note}</div> : null}

      {!rows.length ? <div className="small-muted">Нет сообщений валидации.</div> : null}

      {rows.map((row, index) => (
        <div key={`${row.message}-${index}`} className="validation-row stack-2">
          <div className="flex-row align-center gap-8">
            <span
              className={`badge ${
                row.severity === "ERROR" ? "badge-red" : row.severity === "WARNING" ? "badge-warning" : ""
              }`}
            >
              {row.severity}
            </span>
            <span>{row.message}</span>
          </div>
          <span className="small-muted">
            строка: {row.row ?? "-"}, поле: {row.field ?? "-"}, получено: {new Date().toLocaleTimeString()}
          </span>
        </div>
      ))}
    </div>
  );
}
