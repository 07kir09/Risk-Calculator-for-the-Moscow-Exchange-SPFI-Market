import { useRiskStore } from "../app/store/useRiskStore";
import { ChartCard } from "../widgets/chart-card/ChartCard";
import { KpiCard } from "../widgets/kpi-card/KpiCard";
import { SummaryStrip } from "../widgets/summary-strip/SummaryStrip";
import { ValidationLogPanel } from "../widgets/validation-log/ValidationLogPanel";
import { RequestMetaPanel } from "../widgets/request-debug/RequestMetaPanel";
import { PnlDistributionChart } from "../charts/PnlDistributionChart";
import { RiskContributionChart } from "../charts/RiskContributionChart";
import { formatCurrency } from "../shared/formatters/numberFormat";
import { EmptyStateCard } from "../widgets/empty-state-card/EmptyStateCard";
import { MetricCard } from "../widgets/metric-card/MetricCard";

export function DashboardPage() {
  const result = useRiskStore((state) => state.calculationResult);
  const positions = useRiskStore((state) => state.positionsDraft.length);
  const scenarios = useRiskStore((state) => state.scenariosDraft.length);

  const currency = result?.base_currency ?? "RUB";

  return (
    <div className="page-grid">
      {!result ? (
        <EmptyStateCard message="Пока нет результатов расчёта. Добавьте позиции и запустите расчёт." />
      ) : null}

      <div className="grid-kpi">
        <KpiCard title="Базовая стоимость" value={formatCurrency(result?.base_value ?? null, currency)} />
        <KpiCard title="Исторический VaR" value={formatCurrency(result?.var_hist ?? null, currency)} tone="negative" />
        <KpiCard title="Ожидаемый шортфолл (ES)" value={formatCurrency(result?.es_hist ?? null, currency)} tone="negative" />
        <KpiCard title="LC VaR / Капитал" value={formatCurrency(result?.lc_var ?? result?.capital ?? null, currency)} />
      </div>

      <SummaryStrip />

      <div className="grid-two-dashboard">
        <ChartCard title="Распределение риска" subtitle="Гистограмма с маркерами VaR / ES">
          <PnlDistributionChart values={result?.pnl_distribution} varHist={result?.var_hist} esHist={result?.es_hist} />
        </ChartCard>

        <ChartCard title="Вклад в риск" subtitle="Топ абсолютных контрибьюторов">
          <RiskContributionChart rows={result?.top_contributors?.var_hist} />
        </ChartCard>
      </div>

      <div className="grid-three-equal">
        <ValidationLogPanel />

        <div className="panel panel-padded-12 stack-8">
          <h3 className="section-title">Сводка по сценариям</h3>
          <MetricCard label="Количество сценариев" value={String(scenarios)} />
          <MetricCard label="Вероятностный режим" value={positions > 0 ? "доступен" : "н/д"} />
          <MetricCard label="Стресс-строк" value={String(result?.stress?.length ?? 0)} />
        </div>

        <div className="panel panel-padded-12 stack-8">
          <h3 className="section-title">Сводка параметров расчёта</h3>
          <MetricCard label="Количество позиций" value={String(positions)} />
          <MetricCard label="Базовая валюта" value={currency} />
          <MetricCard label="Уровень доверия" value={String(result?.confidence_level ?? "-")} />
          <MetricCard label="Горизонт" value={String(result?.horizon_days ?? "-")} />
        </div>
      </div>

      <RequestMetaPanel />
    </div>
  );
}
