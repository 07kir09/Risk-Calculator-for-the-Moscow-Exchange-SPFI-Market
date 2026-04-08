import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { PortfolioMetrics, StressResult, MarketScenario } from "../types";

interface Props {
  metrics: PortfolioMetrics | null;
  limitChecks: { metric: string; value: number; limit?: number; breached: boolean }[];
  pnlDistribution: number[];
  scenarios: MarketScenario[];
  stressResults: StressResult[];
}

export default function RiskDashboard({ metrics, limitChecks, pnlDistribution, scenarios, stressResults }: Props) {
  const pnlRef = useRef<HTMLDivElement>(null);
  const stressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pnlRef.current || !pnlDistribution.length) return;
    const chart = echarts.init(pnlRef.current);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {},
      xAxis: { type: "category", data: pnlDistribution.map((_, i) => i), axisLabel: { show: false } },
      yAxis: { type: "value" },
      series: [{ type: "bar", data: pnlDistribution, itemStyle: { color: "#22d3ee" } }],
    });
    return () => chart.dispose();
  }, [pnlDistribution]);

  useEffect(() => {
    if (!stressRef.current || !stressResults.length) return;
    const chart = echarts.init(stressRef.current);
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {},
      xAxis: { type: "category", data: stressResults.map((s) => s.scenario_id) },
      yAxis: { type: "value" },
      series: [
        {
          type: "bar",
          data: stressResults.map((s) => ({ value: s.pnl, itemStyle: { color: s.breached ? "#f87171" : "#22d3ee" } })),
        },
      ],
    });
    return () => chart.dispose();
  }, [stressResults]);

  if (!metrics) return <p>Загрузите портфель и сценарии, чтобы увидеть метрики.</p>;

  return (
    <div>
      <h2>Результаты расчёта</h2>
      <div className="grid">
        <MetricCard label="Базовая стоимость" value={metrics.base_value} />
        <MetricCard label="VaR (hist)" value={metrics.var_hist} />
        <MetricCard label="ES (hist)" value={metrics.es_hist} />
        <MetricCard label="VaR (param)" value={metrics.var_param} />
        <MetricCard label="ES (param)" value={metrics.es_param} />
        <MetricCard label="LC VaR" value={metrics.lc_var} highlight />
      </div>
      <div style={{ marginTop: 12 }}>
        <strong>Греки (суммарно):</strong>
        <div className="grid" style={{ marginTop: 8 }}>
          {Object.entries(metrics.greeks).map(([k, v]) => (
            <div key={k} className="badge warn">{k.toUpperCase()}: {v.toFixed(4)}</div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16 }} className="grid">
        <div className="card" style={{ background: "rgba(255,255,255,0.02)" }}>
          <h3>Распределение PnL</h3>
          <div ref={pnlRef} className="chart-box" />
        </div>
        <div className="card" style={{ background: "rgba(255,255,255,0.02)" }}>
          <h3>Стресс PnL</h3>
          <div ref={stressRef} className="chart-box" />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <h3>Лимиты</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Метрика</th>
              <th>Значение</th>
              <th>Лимит</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {limitChecks.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td>{row.value?.toFixed(4)}</td>
                <td>{row.limit ?? "—"}</td>
                <td>
                  <span className={`badge ${row.breached ? "danger" : "ok"}`}>
                    {row.breached ? "Превышен" : "Ок"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="card" style={{ background: highlight ? "rgba(34, 211, 238, 0.08)" : "rgba(255,255,255,0.02)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value.toFixed(4)}</div>
    </div>
  );
}
