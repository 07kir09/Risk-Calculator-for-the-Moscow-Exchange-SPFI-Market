import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TopContributorRow } from "../shared/types/contracts";

type RiskContributionChartProps = {
  rows: TopContributorRow[] | null | undefined;
};

export function RiskContributionChart({ rows }: RiskContributionChartProps) {
  if (!rows || rows.length === 0) {
    return <div className="small-muted">Нет данных по вкладу в риск.</div>;
  }

  const data = rows.slice(0, 5).map((row) => ({
    id: row.position_id,
    value: row.abs_pnl_contribution,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" />
        <XAxis dataKey="id" interval={0} minTickGap={12} tick={{ fill: "var(--chart-axis)", fontSize: 10 }} tickFormatter={(value) => (String(value).length > 10 ? `${String(value).slice(0, 10)}…` : String(value))} />
        <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
        <Tooltip
          labelFormatter={(label) => `Позиция: ${label}`}
          formatter={(value: number) => [Number(value).toFixed(4), "Абс. вклад"]}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 10,
          }}
        />
        <Bar dataKey="value" fill="var(--cyan-accent)" />
      </BarChart>
    </ResponsiveContainer>
  );
}
