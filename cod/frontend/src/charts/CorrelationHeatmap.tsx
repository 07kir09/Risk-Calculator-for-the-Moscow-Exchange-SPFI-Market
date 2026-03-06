type CorrelationHeatmapProps = {
  matrix: number[][] | null | undefined;
  labels: string[];
};

function toneClass(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));
  const level = Math.min(10, Math.round(Math.abs(clamped) * 10));
  if (clamped >= 0) return `heatmap-tone-pos-${level}`;
  return `heatmap-tone-neg-${level}`;
}

export function CorrelationHeatmap({ matrix, labels }: CorrelationHeatmapProps) {
  if (!matrix || !matrix.length) {
    return <div className="small-muted">Матрица корреляций недоступна для текущего прогона.</div>;
  }

  const compact = labels.length > 24;
  const dense = labels.length > 48;
  const tableClass = `heatmap-table${dense ? " heatmap-table-dense" : compact ? " heatmap-table-compact" : ""}`;

  function shortLabel(value: string): string {
    const limit = dense ? 8 : compact ? 10 : 14;
    if (value.length <= limit) return value;
    return `${value.slice(0, limit)}…`;
  }

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-table-shell">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className="heatmap-corner" />
              {labels.map((label) => (
                <th key={`top-${label}`} className="small-muted heatmap-col-head" title={label}>
                  <span className="heatmap-label-vertical">{shortLabel(label)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((rowLabel, rowIndex) => (
              <tr key={`row-${rowLabel}`}>
                <th className="small-muted heatmap-row-head" title={rowLabel}>{shortLabel(rowLabel)}</th>
                {(matrix[rowIndex] ?? []).map((value, colIndex) => (
                  <td key={`cell-${rowLabel}-${colIndex}`}>
                    <div
                      className={`heatmap-cell ${toneClass(value)}${rowIndex === colIndex ? " heatmap-cell-diag" : ""}`}
                      title={`${rowLabel} / ${labels[colIndex]}: ${value.toFixed(4)}`}
                      aria-label={`corr ${rowLabel} ${labels[colIndex]} ${value.toFixed(4)}`}
                      tabIndex={0}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="small-muted heatmap-legend">Синий: отрицательная корреляция, красный: положительная корреляция</div>
    </div>
  );
}
