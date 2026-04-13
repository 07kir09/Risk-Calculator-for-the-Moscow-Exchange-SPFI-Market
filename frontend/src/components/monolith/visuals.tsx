import { CSSProperties } from "react";

type CurveProps = {
  values: number[];
  stroke?: string;
  fill?: string;
  height?: number;
  className?: string;
};

type ContributorBarRow = {
  label: string;
  value: number;
  tone?: "positive" | "negative" | "neutral";
};

type CorrelationMatrixProps = {
  matrix: number[][];
  labels?: string[];
  size?: number;
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toneColor(value: number) {
  if (value > 0.18) return "rgba(110,255,142,0.88)";
  if (value < -0.18) return "rgba(255,119,119,0.88)";
  return "rgba(244,241,234,0.42)";
}

function clampCorrelation(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function trimMatrixLabel(label: string, max = 14) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function matrixCellBackground(value: number, diagonal: boolean) {
  if (diagonal) return "rgba(125, 167, 255, 0.26)";
  const alpha = 0.08 + Math.abs(value) * 0.52;
  return value >= 0
    ? `rgba(110, 255, 142, ${alpha.toFixed(3)})`
    : `rgba(255, 119, 119, ${alpha.toFixed(3)})`;
}

function matrixCellTextColor(value: number, diagonal: boolean) {
  if (diagonal || Math.abs(value) >= 0.55) return "rgba(255,255,255,0.96)";
  if (Math.abs(value) >= 0.28) return "rgba(255,255,255,0.84)";
  return "rgba(244,241,234,0.72)";
}

function normalizeCorrelationMatrix(matrix: number[][], labels?: string[], size = 9) {
  const rows = matrix.filter((row) => Array.isArray(row) && row.length > 0);
  if (!rows.length) return null;

  const minCols = Math.min(...rows.map((row) => row.length));
  const sourceSize = Math.min(rows.length, minCols);
  if (sourceSize <= 0) return null;

  const viewSize = Math.min(Math.max(size, 1), sourceSize);
  const values = Array.from({ length: viewSize }, (_, rowIndex) =>
    Array.from({ length: viewSize }, (_, colIndex) => {
      if (rowIndex === colIndex) return 1;
      const direct = Number(rows[rowIndex]?.[colIndex]);
      const reverse = Number(rows[colIndex]?.[rowIndex]);
      const hasDirect = Number.isFinite(direct);
      const hasReverse = Number.isFinite(reverse);
      const raw = hasDirect && hasReverse ? (direct + reverse) / 2 : hasDirect ? direct : hasReverse ? reverse : 0;
      return clampCorrelation(raw);
    })
  );

  const axis = Array.from({ length: viewSize }, (_, index) => labels?.[index] ?? `P${index + 1}`);
  return {
    values,
    axis,
    sourceSize,
    truncated: sourceSize > viewSize,
  };
}

function findStrongestPair(matrix: number[][], labels: string[], mode: "positive" | "negative") {
  let bestValue = mode === "positive" ? -Infinity : Infinity;
  let bestPair: { left: string; right: string; value: number } | null = null;

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    for (let colIndex = rowIndex + 1; colIndex < matrix[rowIndex].length; colIndex += 1) {
      const value = matrix[rowIndex][colIndex];
      if (
        (mode === "positive" && value > bestValue) ||
        (mode === "negative" && value < bestValue)
      ) {
        bestValue = value;
        bestPair = { left: labels[rowIndex], right: labels[colIndex], value };
      }
    }
  }

  if (!bestPair) return null;
  if (mode === "positive" && bestPair.value <= 0) return null;
  if (mode === "negative" && bestPair.value >= 0) return null;
  return bestPair;
}

function buildCurvePath(values: number[], width: number, height: number) {
  if (!values.length) return { line: "", area: "" };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return { x, y };
  });

  const segments = points.map((point, index, arr) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const prev = arr[index - 1];
    const cx = (prev.x + point.x) / 2;
    return `C ${cx} ${prev.y}, ${cx} ${point.y}, ${point.x} ${point.y}`;
  });

  const line = segments.join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L ${last.x} ${height} L ${first.x} ${height} Z`;

  return { line, area };
}

export function SignalCurve({
  values,
  stroke = "rgba(110,255,142,0.95)",
  fill = "rgba(110,255,142,0.14)",
  height = 180,
  className,
}: CurveProps) {
  const safeValues = values.length ? values : [0, 0.4, 0.2, 0.7, 0.5, 0.82, 0.66];
  const width = 640;
  const { line, area } = buildCurvePath(safeValues, width, height);

  return (
    <div className={className ?? "signalCurve"}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill} />
            <stop offset="100%" stopColor="rgba(110,255,142,0)" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#curve-fill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function ContributorBars({ rows }: { rows: ContributorBarRow[] }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return (
    <div className="contributorList">
      {rows.map((row) => {
        const tone =
          row.tone ??
          (row.value > 0 ? "positive" : row.value < 0 ? "negative" : "neutral");

        return (
          <div className="contributorRow" key={row.label}>
            <div className="contributorRowHeader">
              <span>{row.label}</span>
              <span className={`contributorValue contributorValue--${tone}`}>{Math.abs(row.value).toFixed(1)}%</span>
            </div>
            <div className="contributorTrack">
              <div
                className={`contributorFill contributorFill--${tone}`}
                style={{ width: `${clamp01(Math.abs(row.value) / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function UtilizationPanel({
  utilization,
  inflow,
  outflow,
  statusLabel,
  caption,
}: {
  utilization: number;
  inflow: number;
  outflow: number;
  statusLabel: string;
  caption: string;
}) {
  const bounded = Math.max(0, Math.min(100, utilization));
  const style = {
    "--utilization-height": `${bounded}%`,
  } as CSSProperties;

  return (
    <aside className="utilizationPanel" style={style}>
      <div className="utilizationPanelLabel">UTILIZATION</div>
      <div className="utilizationPanelValue">
        <span>{Math.round(bounded)}</span>
        <small>%</small>
      </div>
      <div className="utilizationPanelMeter">
        <div className="utilizationPanelMeterFill" />
      </div>
      <div className="utilizationPanelCaption">
        {caption} <strong>{statusLabel}</strong>.
      </div>
      <div className="utilizationPanelFlow">
        <div>
          <span>INFLOW</span>
          <strong className="isPositive">{inflow >= 0 ? `+${inflow.toFixed(1)}` : inflow.toFixed(1)}%</strong>
        </div>
        <div>
          <span>OUTFLOW</span>
          <strong className={outflow <= 0 ? "isNegative" : "isPositive"}>
            {outflow >= 0 ? `+${outflow.toFixed(1)}` : outflow.toFixed(1)}%
          </strong>
        </div>
      </div>
    </aside>
  );
}

export function CorrelationMatrix({ matrix, labels, size = 9 }: CorrelationMatrixProps) {
  const normalized = normalizeCorrelationMatrix(matrix, labels, size);

  if (!normalized) {
    return (
      <div className="matrixEmpty">
        Корреляции не рассчитаны.
        <br />
        Нужно минимум две позиции и два сценария с ненулевой вариативностью P&amp;L.
      </div>
    );
  }

  const { values, axis, sourceSize, truncated } = normalized;
  const strongestPositive = findStrongestPair(values, axis, "positive");
  const strongestNegative = findStrongestPair(values, axis, "negative");
  const tableStyle = {
    gridTemplateColumns: `minmax(132px, 160px) repeat(${values.length}, minmax(52px, 1fr))`,
  } as CSSProperties;

  return (
    <div className="matrixWrap">
      <div className="matrixSummary">
        <div className="matrixSummaryItem">
          <span>Размер</span>
          <strong>{values.length}x{values.length}</strong>
        </div>
        <div className="matrixSummaryItem">
          <span>Max +</span>
          <strong>{strongestPositive ? `${strongestPositive.value.toFixed(2)} · ${trimMatrixLabel(strongestPositive.left, 10)} / ${trimMatrixLabel(strongestPositive.right, 10)}` : "нет"}</strong>
        </div>
        <div className="matrixSummaryItem">
          <span>Max -</span>
          <strong>{strongestNegative ? `${strongestNegative.value.toFixed(2)} · ${trimMatrixLabel(strongestNegative.left, 10)} / ${trimMatrixLabel(strongestNegative.right, 10)}` : "нет"}</strong>
        </div>
      </div>

      {truncated ? (
        <div className="matrixNote">
          Показаны первые {values.length} позиций из {sourceSize}, чтобы матрица оставалась читаемой.
        </div>
      ) : null}

      <div className="matrixTableWrap">
        <div className="matrixTable" style={tableStyle}>
          <div className="matrixCorner">Позиции</div>
          {axis.map((label) => (
            <div key={`top-${label}`} className="matrixAxisLabel matrixAxisLabel--top" title={label}>
              {trimMatrixLabel(label, 10)}
            </div>
          ))}

          {values.flatMap((row, rowIndex) => [
            <div
              key={`side-${axis[rowIndex]}`}
              className="matrixAxisLabel matrixAxisLabel--side"
              title={axis[rowIndex]}
            >
              {trimMatrixLabel(axis[rowIndex], 16)}
            </div>,
            ...row.map((value, colIndex) => {
              const diagonal = rowIndex === colIndex;
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className={`matrixCell ${diagonal ? "matrixCell--diagonal" : ""}`}
                  title={`${axis[rowIndex]} × ${axis[colIndex]}: ${value.toFixed(2)}`}
                  style={{
                    background: matrixCellBackground(value, diagonal),
                    color: matrixCellTextColor(value, diagonal),
                    boxShadow: diagonal ? "inset 0 0 0 1px rgba(125,167,255,0.28)" : undefined,
                  }}
                >
                  <span>{value.toFixed(2)}</span>
                </div>
              );
            }),
          ])}
        </div>
      </div>

      <div className="matrixLegend">
        <span>-1.0 (inverse)</span>
        <div className="matrixLegendBar" />
        <span>+1.0 (positive)</span>
      </div>
    </div>
  );
}
