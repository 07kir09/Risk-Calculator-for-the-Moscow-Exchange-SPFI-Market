type UploadPreviewProps = {
  fileName: string;
  delimiter: string;
  rows: Record<string, string>[];
};

export function UploadPreview({ fileName, delimiter, rows }: UploadPreviewProps) {
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const preview = rows.slice(0, 10);

  return (
    <div className="panel panel-padded-12 stack-8">
      <h3 className="section-title">Предпросмотр загрузки</h3>
      <div className="small-muted">Файл: {fileName}</div>
      <div className="small-muted">Строк: {rows.length}</div>
      <div className="small-muted">Колонок: {columns.length}</div>
      <div className="small-muted">Определённый разделитель: {delimiter}</div>

      <div className="table-wrap table-wrap-280">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={`${index}-${column}`}>{row[column]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
