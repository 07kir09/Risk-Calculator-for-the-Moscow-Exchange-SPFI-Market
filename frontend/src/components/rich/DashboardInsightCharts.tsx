import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

export type CompositionSlice = {
  label: string;
  value: number;
  color?: string;
};

export type MetricStackSeries = {
  key: string;
  label: string;
  color: string;
};

export type MetricStackRow = {
  label: string;
  [key: string]: string | number;
};

export type RiskConnectionNode = {
  id: string;
  label: string;
  weight: number;
  tone?: "metric" | "positive" | "negative" | "neutral";
};

export type RiskConnectionLink = {
  from: string;
  to: string;
  weight: number;
};

const tooltipStyle = {
  contentStyle: {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(10,10,12,0.94)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
    padding: "8px 12px",
    fontSize: 12,
  },
  labelStyle: { color: "rgba(244,241,234,0.56)", marginBottom: 4 },
};

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(abs < 10 ? 2 : 0);
}

function trimLabel(label: string, max = 18) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function PortfolioCompositionDonut({
  data,
  unit,
  height = 280,
}: {
  data: CompositionSlice[];
  unit?: string;
  height?: number;
}) {
  const safe =
    data.length > 0
      ? data
      : [
          { label: "FX", value: 42, color: "#7da7ff" },
          { label: "Опционы", value: 31, color: "#6eff8e" },
          { label: "IR", value: 27, color: "#ffb86a" },
        ];

  const total = safe.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="compositionDonut">
      <div className="compositionDonutChart">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <RechartsTooltip
              {...tooltipStyle}
              formatter={(value: number) => [
                `${formatCompact(Number(value ?? 0))}${unit ? ` ${unit}` : ""}`,
                "Доля",
              ]}
            />
            <Pie
              data={safe}
              dataKey="value"
              nameKey="label"
              innerRadius="58%"
              outerRadius="84%"
              paddingAngle={2}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            >
              {safe.map((slice, index) => (
                <Cell key={`${slice.label}-${index}`} fill={slice.color ?? "#7da7ff"} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="compositionDonutCenter">
          <strong>{formatCompact(total)}</strong>
          <span>{unit ? `общий объём, ${unit}` : "общий объём"}</span>
        </div>
      </div>

      <div className="compositionLegend">
        {safe.map((slice) => {
          const share = total > 0 ? (slice.value / total) * 100 : 0;
          return (
            <div key={slice.label} className="compositionLegendItem">
              <span
                className="compositionLegendDot"
                style={{ background: slice.color ?? "#7da7ff" }}
                aria-hidden="true"
              />
              <div className="compositionLegendMeta">
                <strong>{slice.label}</strong>
                <span>{formatCompact(slice.value)} · {share.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MetricCompositionChart({
  data,
  series,
  height = 280,
}: {
  data: MetricStackRow[];
  series: MetricStackSeries[];
  height?: number;
}) {
  if (!data.length || !series.length) {
    return <div className="stackedMetricEmpty">Недостаточно данных о вкладах, чтобы построить композицию метрик.</div>;
  }

  const seriesByKey = new Map(series.map((item) => [item.key, item]));

  return (
    <div className="stackedMetricChart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: "rgba(244,241,234,0.72)", fontSize: 12, fontWeight: 600 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            width={44}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            tick={{ fill: "rgba(244,241,234,0.42)", fontSize: 11 }}
          />
          <RechartsTooltip
            {...tooltipStyle}
            formatter={(value, name) => [
              `${Number(value ?? 0).toFixed(1)}%`,
              seriesByKey.get(String(name))?.label ?? String(name),
            ]}
          />
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId="composition"
              radius={index === series.length - 1 ? [10, 10, 0, 0] : [0, 0, 0, 0]}
              animationDuration={620 + index * 70}
            >
              {data.map((row) => (
                <Cell key={`${String(row.label)}-${item.key}`} fill={item.color} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      <div className="stackedMetricLegend">
        {series.map((item) => (
          <div key={item.key} className="stackedMetricLegendItem">
            <span
              className="stackedMetricLegendSwatch"
              style={{ background: item.color }}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function nodeFill(tone?: RiskConnectionNode["tone"]) {
  switch (tone) {
    case "positive":
      return "rgba(110,255,142,0.94)";
    case "negative":
      return "rgba(255,119,119,0.94)";
    case "metric":
      return "rgba(125,167,255,0.96)";
    default:
      return "rgba(244,241,234,0.88)";
  }
}

export function RiskConnectionMap({
  metrics,
  positions,
  links,
  height = 360,
}: {
  metrics: RiskConnectionNode[];
  positions: RiskConnectionNode[];
  links: RiskConnectionLink[];
  height?: number;
}) {
  if (!metrics.length || !positions.length || !links.length) {
    return <div className="riskConnectionEmpty">Карта связей появится, когда backend вернёт вклады позиций в риск-метрики.</div>;
  }

  const width = 620;
  const viewHeight = 360;
  const cx = width / 2;
  const cy = viewHeight / 2;
  const metricRadius = 108;
  const positionRadius = 214;
  const maxMetricWeight = Math.max(...metrics.map((node) => node.weight), 1);
  const maxPositionWeight = Math.max(...positions.map((node) => node.weight), 1);
  const maxLinkWeight = Math.max(...links.map((link) => link.weight), 1);

  const metricCoords = new Map(
    metrics.map((node, index) => [
      node.id,
      {
        ...polar(cx, cy, metricRadius, (360 / metrics.length) * index),
        radius: 17 + (node.weight / maxMetricWeight) * 10,
        node,
      },
    ])
  );

  const positionCoords = new Map(
    positions.map((node, index) => [
      node.id,
      {
        ...polar(cx, cy, positionRadius, (360 / positions.length) * index),
        radius: 11 + (node.weight / maxPositionWeight) * 10,
        node,
      },
    ])
  );

  return (
    <div className="riskConnectionWrap">
      <div className="riskConnectionViewport" style={{ height }}>
        <svg viewBox={`0 0 ${width} ${viewHeight}`} className="riskConnectionSvg" role="img" aria-label="Карта связей риска">
          <defs>
            <radialGradient id="risk-center-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(125,167,255,0.2)" />
              <stop offset="100%" stopColor="rgba(125,167,255,0)" />
            </radialGradient>
          </defs>

          <circle cx={cx} cy={cy} r="36" fill="url(#risk-center-glow)" />
          <circle cx={cx} cy={cy} r={metricRadius} className="riskConnectionRing" />
          <circle cx={cx} cy={cy} r={positionRadius} className="riskConnectionRing riskConnectionRing--outer" />

          {Array.from(metricCoords.values()).map((point) => (
            <line
              key={`center-${point.node.id}`}
              x1={cx}
              y1={cy}
              x2={point.x}
              y2={point.y}
              className="riskConnectionSpine"
            />
          ))}

          {links.map((link) => {
            const from = metricCoords.get(link.from);
            const to = positionCoords.get(link.to);
            if (!from || !to) return null;
            const opacity = 0.18 + (link.weight / maxLinkWeight) * 0.52;
            const widthScale = 1 + (link.weight / maxLinkWeight) * 4;
            return (
              <line
                key={`${link.from}-${link.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className="riskConnectionLink"
                style={{ opacity, strokeWidth: widthScale }}
              />
            );
          })}

          <circle cx={cx} cy={cy} r="24" className="riskConnectionCenterNode" />
          <text x={cx} y={cy - 2} textAnchor="middle" className="riskConnectionCenterLabel">Risk</text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="riskConnectionCenterSubLabel">map</text>

          {Array.from(metricCoords.values()).map((point) => (
            <g key={point.node.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={point.radius}
                fill={nodeFill("metric")}
                className="riskConnectionNode riskConnectionNode--metric"
              />
              <text x={point.x} y={point.y + point.radius + 16} textAnchor="middle" className="riskConnectionMetricLabel">
                {trimLabel(point.node.label, 11)}
              </text>
            </g>
          ))}

          {Array.from(positionCoords.values()).map((point) => {
            const anchor = point.x >= cx ? "start" : "end";
            const offset = point.x >= cx ? point.radius + 12 : -(point.radius + 12);
            return (
              <g key={point.node.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.radius}
                  fill={nodeFill(point.node.tone)}
                  className="riskConnectionNode"
                />
                <text
                  x={point.x + offset}
                  y={point.y + 4}
                  textAnchor={anchor}
                  className="riskConnectionPositionLabel"
                >
                  {trimLabel(point.node.label, 15)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="riskConnectionLegend">
        <div className="riskConnectionLegendItem">
          <span className="riskConnectionLegendSwatch riskConnectionLegendSwatch--metric" aria-hidden="true" />
          <span>Метрики</span>
        </div>
        <div className="riskConnectionLegendItem">
          <span className="riskConnectionLegendSwatch riskConnectionLegendSwatch--positive" aria-hidden="true" />
          <span>Позиции с положительным вкладом</span>
        </div>
        <div className="riskConnectionLegendItem">
          <span className="riskConnectionLegendSwatch riskConnectionLegendSwatch--negative" aria-hidden="true" />
          <span>Позиции с отрицательным вкладом</span>
        </div>
      </div>
    </div>
  );
}
