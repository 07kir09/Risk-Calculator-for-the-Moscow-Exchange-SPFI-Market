import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

type MiniTrendChartProps = {
  values: number[];
};

export function MiniTrendChart({ values }: MiniTrendChartProps) {
  const data = values.map((value, index) => ({ index, value }));
  if (!data.length) {
    return <div className="small-muted">Нет данных тренда.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={110}>
      <LineChart data={data}>
        <Tooltip
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 10,
          }}
        />
        <Line dataKey="value" stroke="var(--chart-base-stroke)" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
