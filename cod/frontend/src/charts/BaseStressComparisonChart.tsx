import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type BaseStressComparisonChartProps = {
  baseValues: number[] | null | undefined;
  selected?: {
    scenario_id: string;
    underlying_shift: number;
    volatility_shift: number;
    rate_shift: number;
    pnl: number | null;
  } | null;
};

type Row = {
  index: number;
  base: number;
  stress: number;
};

function downsampleSeries(values: number[], maxPoints = 800): number[] {
  if (values.length <= maxPoints) return values;
  const step = Math.ceil(values.length / maxPoints);
  const sampled: number[] = [];
  for (let index = 0; index < values.length; index += step) {
    sampled.push(values[index]);
  }
  const last = values[values.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

function buildSeries(values: number[], selected: BaseStressComparisonChartProps["selected"]): Row[] {
  const avgAbs = values.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(values.length, 1);
  const underlying = selected?.underlying_shift ?? 0;
  const volatility = selected?.volatility_shift ?? 0;
  const rate = selected?.rate_shift ?? 0;
  const scale = 1 + underlying * 0.7 + volatility * 0.45 - rate * 0.25;
  const pnlOffset = ((selected?.pnl ?? 0) / Math.max(values.length, 1)) * 0.08;
  const offset = pnlOffset + avgAbs * (underlying * 0.1 + volatility * 0.05 - rate * 0.03);

  return values.map((base, index) => ({
    index,
    base,
    stress: base * scale + offset,
  }));
}

export function BaseStressComparisonChart({ baseValues, selected }: BaseStressComparisonChartProps) {
  const sampled = useMemo(
    () => (baseValues && baseValues.length ? downsampleSeries(baseValues, 800) : []),
    [baseValues]
  );
  const data = useMemo(
    () => (sampled.length ? buildSeries(sampled, selected) : []),
    [sampled, selected]
  );

  if (!baseValues || !baseValues.length) {
    return <div className="small-muted">Результаты стресс-теста появятся после расчёта со включёнными сценариями.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="var(--chart-grid)" />
        <XAxis dataKey="index" interval="preserveStartEnd" minTickGap={22} tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
        <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 10 }} />
        <Tooltip
          labelFormatter={(value) => `Индекс: ${value}`}
          formatter={(value: number, name: string) => [Number(value).toFixed(4), name]}
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 10,
          }}
        />
        <Area type="monotone" dataKey="base" stroke="var(--chart-base-stroke)" fill="var(--chart-base-fill)" name="Базовый" />
        <Area
          type="monotone"
          dataKey="stress"
          stroke="var(--chart-stress-stroke)"
          fill="var(--chart-stress-fill)"
          name={`Стресс (${selected?.scenario_id ?? "выбранный"})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
