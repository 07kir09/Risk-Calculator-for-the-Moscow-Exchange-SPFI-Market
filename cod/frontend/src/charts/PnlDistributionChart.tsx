import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PnlDistributionChartProps = {
  values: number[] | null | undefined;
  varHist?: number | null;
  esHist?: number | null;
};

type Bin = { x: number; count: number };

function toHistogram(values: number[], bins = 24): Bin[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ x: min, count: values.length }];
  }
  const step = (max - min) / bins;
  const bucket = new Array(bins).fill(0);
  values.forEach((value) => {
    const raw = Math.floor((value - min) / step);
    const index = Math.max(0, Math.min(bins - 1, raw));
    bucket[index] += 1;
  });
  return bucket.map((count, index) => ({ x: min + index * step, count }));
}

export function PnlDistributionChart({ values, varHist, esHist }: PnlDistributionChartProps) {
  const bins = values && values.length > 1600 ? 40 : values && values.length > 500 ? 32 : 24;
  const data = useMemo(() => (values && values.length > 0 ? toHistogram(values, bins) : []), [bins, values]);

  if (!values || values.length === 0) {
    return <div className="small-muted">Распределение сценариев недоступно.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--chart-grid)" />
        <XAxis dataKey="x" tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
        <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
        <Tooltip
          labelFormatter={(value) => `PnL: ${Number(value).toFixed(4)}`}
          formatter={(value: number) => [Number(value).toFixed(0), "Количество"]}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 10,
          }}
        />
        <Bar dataKey="count" fill="var(--chart-base-stroke)" radius={[4, 4, 0, 0]} />
        <ReferenceLine x={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
        {varHist !== null && varHist !== undefined ? <ReferenceLine x={-Math.abs(varHist)} stroke="var(--red-negative)" label="VaR" /> : null}
        {esHist !== null && esHist !== undefined ? <ReferenceLine x={-Math.abs(esHist)} stroke="var(--orange-warning)" label="ES" /> : null}
      </BarChart>
    </ResponsiveContainer>
  );
}
