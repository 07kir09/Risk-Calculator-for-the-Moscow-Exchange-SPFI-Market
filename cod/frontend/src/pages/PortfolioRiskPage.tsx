import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useRiskStore } from "../app/store/useRiskStore";
import { ChartCard } from "../widgets/chart-card/ChartCard";
import { KpiCard } from "../widgets/kpi-card/KpiCard";
import { PnlDistributionChart } from "../charts/PnlDistributionChart";
import { CorrelationHeatmap } from "../charts/CorrelationHeatmap";
import { KeyRiskTable } from "../features/limits/KeyRiskTable";
import { LiquidityBreakdownTable } from "../features/limits/LiquidityBreakdownTable";
import { ContributorsTable } from "../features/calculations/ContributorsTable";
import { formatCurrency, formatNumber } from "../shared/formatters/numberFormat";

const tabs = ["summary", "var", "sensitivities", "contributors", "limits"] as const;
const tabLabel: Record<(typeof tabs)[number], string> = {
  summary: "Сводка",
  var: "VaR",
  sensitivities: "Чувствительности",
  contributors: "Контрибьюторы",
  limits: "Лимиты",
};

function contributorMetricLabel(metric: string): string {
  if (metric === "var_hist") return "Ист. VaR";
  if (metric === "es_hist") return "Ист. ES";
  if (metric === "stress") return "Стресс";
  return metric;
}

export function PortfolioRiskPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") ?? "summary") as (typeof tabs)[number];

  const result = useRiskStore((state) => state.calculationResult);
  const positions = useRiskStore((state) => state.positionsDraft);
  const selectedMetric = useRiskStore((state) => state.selectedContributorMetric);
  const setSelectedMetric = useRiskStore((state) => state.setSelectedContributorMetric);

  const currency = result?.base_currency ?? "RUB";
  const labels = useMemo(() => positions.map((position) => position.position_id), [positions]);

  return (
    <div className="page-grid">
      <div className="tab-strip">
        {tabs.map((item) => (
          <button
            key={item}
            className={`tab-chip${tab === item ? " tab-chip-active" : ""}`}
            onClick={() => setSearchParams({ tab: item })}
          >
            {tabLabel[item]}
          </button>
        ))}
      </div>

      <div className="grid-two-main">
        <ChartCard title="Распределение потерь" subtitle="Гистограмма / плотность по pnl_distribution">
          <PnlDistributionChart values={result?.pnl_distribution} varHist={result?.var_hist} esHist={result?.es_hist} />
        </ChartCard>
        <ChartCard title="Матрица корреляций" subtitle="Тепловая карта NxN">
          <CorrelationHeatmap matrix={result?.correlations} labels={labels} />
        </ChartCard>
      </div>

      {tab === "summary" || tab === "var" ? (
        <div className="grid-kpi">
          <KpiCard title="Базовая стоимость" value={formatCurrency(result?.base_value ?? null, currency)} />
          <KpiCard title="Исторический VaR" value={formatCurrency(result?.var_hist ?? null, currency)} tone="negative" />
          <KpiCard title="Исторический ES" value={formatCurrency(result?.es_hist ?? null, currency)} tone="negative" />
          <KpiCard title="Параметрический VaR" value={formatCurrency(result?.var_param ?? null, currency)} tone="negative" />
          <KpiCard title="Параметрический ES" value={formatCurrency(result?.es_param ?? null, currency)} tone="negative" />
          <KpiCard title="LC VaR" value={formatCurrency(result?.lc_var ?? null, currency)} />
          <KpiCard title="Капитал" value={formatCurrency(result?.capital ?? null, currency)} />
          <KpiCard title="Начальная маржа" value={formatCurrency(result?.initial_margin ?? null, currency)} />
          <KpiCard title="Вариационная маржа" value={formatCurrency(result?.variation_margin ?? null, currency)} />
        </div>
      ) : null}

      {tab === "sensitivities" ? (
        <div className="panel panel-padded-12 stack-10">
          <h3 className="section-title">Чувствительности</h3>
          {!result?.greeks ? (
            <div className="small-muted">Греки не рассчитаны для текущего прогона.</div>
          ) : (
            <>
              <div className="grid-kpi grid-kpi-six">
                {Object.entries(result.greeks).map(([key, value]) => (
                  <KpiCard key={key} title={key.toUpperCase()} value={formatNumber(value, 6)} />
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>метрика</th>
                      <th>значение</th>
                      <th>интерпретация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.greeks).map(([key, value]) => (
                      <tr key={key}>
                        <td title={key}><span className="numeric-value">{key}</span></td>
                        <td title={formatNumber(value, 6)}><span className="numeric-value">{formatNumber(value, 6)}</span></td>
                        <td title="Показатель чувствительности"><span className="numeric-value">Показатель чувствительности</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === "contributors" ? (
        <div className="panel panel-padded-12 stack-8">
          <div className="filters-compact">
            <span className="filters-compact-title">Метрика:</span>
            <button className={`filter-chip${selectedMetric === "var_hist" ? " filter-chip-active" : ""}`} onClick={() => setSelectedMetric("var_hist")}>Ист. VaR</button>
            <button className={`filter-chip${selectedMetric === "es_hist" ? " filter-chip-active" : ""}`} onClick={() => setSelectedMetric("es_hist")}>Ист. ES</button>
            <button className={`filter-chip${selectedMetric === "stress" ? " filter-chip-active" : ""}`} onClick={() => setSelectedMetric("stress")}>Стресс</button>
            <span className="filter-stat">выбрано: {contributorMetricLabel(selectedMetric)}</span>
          </div>
          <ContributorsTable metric={selectedMetric} />
        </div>
      ) : null}

      {tab === "limits" ? <KeyRiskTable /> : null}

      {tab === "limits" || tab === "summary" ? <LiquidityBreakdownTable /> : null}
    </div>
  );
}
