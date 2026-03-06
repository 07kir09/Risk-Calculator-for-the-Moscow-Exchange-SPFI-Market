import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ScenarioBarChartProps = {
  rows: Array<{ scenario_id: string; pnl: number; breached?: boolean }>;
  onSelect?: (scenarioId: string) => void;
};

export function ScenarioBarChart({ rows, onSelect }: ScenarioBarChartProps) {
  if (!rows.length) {
    return <div className="small-muted">Нет строк сценариев.</div>;
  }

  const dense = rows.length > 24;
  const veryDense = rows.length > 64;
  const interval = rows.length > 120 ? Math.ceil(rows.length / 12) : rows.length > 50 ? Math.ceil(rows.length / 16) : 0;

  function formatScenarioLabel(value: string): string {
    if (!dense) return value;
    if (value.length <= 10) return value;
    return `${value.slice(0, 10)}…`;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: dense ? 20 : 4 }}>
        <CartesianGrid stroke="var(--chart-grid)" />
        <XAxis
          dataKey="scenario_id"
          interval={interval}
          minTickGap={veryDense ? 18 : 10}
          height={dense ? 46 : 30}
          tick={{ fill: "var(--chart-axis)", fontSize: veryDense ? 9 : 10 }}
          tickFormatter={formatScenarioLabel}
        />
        <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
        <Tooltip
          labelFormatter={(label) => `Сценарий: ${label}`}
          formatter={(value: number) => [Number(value).toFixed(4), "PnL"]}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 10,
          }}
        />
        <Bar dataKey="pnl" maxBarSize={26} onClick={(entry: any) => onSelect?.(entry.scenario_id)}>
          {rows.map((row) => (
            <Cell key={row.scenario_id} fill={row.pnl < 0 ? "var(--red-negative)" : "var(--green-positive)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
