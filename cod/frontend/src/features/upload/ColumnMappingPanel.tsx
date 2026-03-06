import { requiredUploadTargets, uploadMappingTargets } from "../../shared/constants/defaults";
import { CsvColumnMapping } from "../../shared/lib/csvImport";

type ColumnMappingPanelProps = {
  columns: string[];
  mapping: CsvColumnMapping;
  sampleRow?: Record<string, string>;
  onChange: (target: string, column: string) => void;
};

export function ColumnMappingPanel({ columns, mapping, sampleRow, onChange }: ColumnMappingPanelProps) {
  return (
    <div className="panel panel-padded-12 stack-10">
      <h3 className="section-title">Сопоставление колонок</h3>
      <div className="table-wrap table-wrap-420">
        <table>
          <thead>
            <tr>
              <th>Поле назначения</th>
              <th>Колонка CSV</th>
              <th>Статус</th>
              <th>Пример значения</th>
            </tr>
          </thead>
          <tbody>
            {uploadMappingTargets.map((target) => {
              const column = mapping[target];
              const required = requiredUploadTargets.includes(target);
              const matched = Boolean(column);
              return (
                <tr key={target}>
                  <td>{target}</td>
                  <td>
                    <select className="select" value={column ?? ""} onChange={(event) => onChange(target, event.target.value)}>
                      <option value="">-- не сопоставлено --</option>
                      {columns.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {matched ? <span className="badge badge-green">сопоставлено</span> : required ? <span className="badge badge-red">не хватает</span> : <span className="badge">необязательно</span>}
                  </td>
                  <td>{column ? sampleRow?.[column] ?? "-" : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
