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
  const safeMatrix =
    matrix.length > 0
      ? matrix.slice(0, size).map((row) => row.slice(0, size))
      : Array.from({ length: size }, (_, rowIndex) =>
          Array.from({ length: size }, (_, colIndex) => {
            if (rowIndex === colIndex) return 1;
            const seed = Math.sin((rowIndex + 1) * (colIndex + 2)) * 0.72;
            return Number(seed.toFixed(2));
          })
        );

  const axis = labels?.slice(0, safeMatrix.length) ?? safeMatrix.map((_, index) => `F${index + 1}`);

  return (
    <div className="matrixWrap">
      <div
        className="matrixGrid"
        style={{ gridTemplateColumns: `repeat(${safeMatrix.length}, minmax(0, 1fr))` }}
      >
        {safeMatrix.flatMap((row, rowIndex) =>
          row.map((value, colIndex) => (
            <div
              key={`${rowIndex}-${colIndex}`}
              className="matrixCell"
              title={`${axis[rowIndex]} x ${axis[colIndex]}: ${value.toFixed(2)}`}
              style={{
                background: `radial-gradient(circle at 50% 50%, ${toneColor(value)} 0%, rgba(255,255,255,0.02) 65%)`,
                opacity: 0.4 + clamp01(Math.abs(value)) * 0.6,
              }}
            />
          ))
        )}
      </div>
      <div className="matrixLegend">
        <span>-1.0 (inverse)</span>
        <div className="matrixLegendBar" />
        <span>+1.0 (positive)</span>
      </div>
    </div>
  );
}
