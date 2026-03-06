import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useRiskStore } from "../app/store/useRiskStore";
import { PositionsTable } from "../features/positions/PositionsTable";
import { ScenariosTable } from "../features/scenarios/ScenariosTable";
import { LimitsEditor } from "../features/limits/LimitsEditor";
import { RunConfigPanel } from "../features/run-config/RunConfigPanel";
import { CalculateButton } from "../features/calculations/CalculateButton";
import { MiniTrendChart } from "../charts/MiniTrendChart";
import { CalculationActions } from "../features/calculations/CalculationActions";
import { formatCurrency } from "../shared/formatters/numberFormat";

const tabs = ["positions", "scenarios", "limits", "run-config"] as const;
const tabLabel: Record<(typeof tabs)[number], string> = {
  positions: "Позиции",
  scenarios: "Сценарии",
  limits: "Лимиты",
  "run-config": "Параметры расчёта",
};

function runStatusLabel(status: string): string {
  if (status === "Updated just now") return "Обновлено";
  if (status === "Ready to calculate") return "Готово к расчёту";
  if (status === "Calculating") return "Идёт расчёт";
  if (status === "Error") return "Ошибка";
  if (status === "Outdated") return "Устарело";
  if (status === "Draft") return "Черновик";
  return status;
}

export function PortfolioBuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get("tab") ?? "positions") as (typeof tabs)[number];
  const importedRows = Number(searchParams.get("imported") ?? 0);

  const positions = useRiskStore((state) => state.positionsDraft);
  const scenarios = useRiskStore((state) => state.scenariosDraft);
  const runStatus = useRiskStore((state) => state.runStatus);
  const result = useRiskStore((state) => state.calculationResult);
  const resetDraft = useRiskStore((state) => state.resetDraft);
  const clientValidationErrors = useRiskStore((state) => state.clientValidationErrors);
  const requestValidationErrors = useRiskStore((state) => state.requestValidationErrors);
  const lastError = useRiskStore((state) => state.lastError);

  const content = useMemo(() => {
    if (currentTab === "positions") return <PositionsTable />;
    if (currentTab === "scenarios") return <ScenariosTable />;
    if (currentTab === "limits") return <LimitsEditor />;
    return <RunConfigPanel />;
  }, [currentTab]);

  return (
    <div className="page-grid">
      <div className="flex-row justify-between gap-8 wrap">
        <div className="tab-strip">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`tab-chip${currentTab === tab ? " tab-chip-active" : ""}`}
              onClick={() => setSearchParams({ tab })}
            >
              {tabLabel[tab]}
            </button>
          ))}
        </div>
        <CalculationActions />
      </div>

      {clientValidationErrors.length ? (
        <div className="panel panel-danger panel-padded-10">
          Ошибка клиентской валидации. Исправьте подсвеченные поля перед расчётом. ({clientValidationErrors.length} проблем)
        </div>
      ) : null}

      {requestValidationErrors.length ? (
        <div className="panel panel-warning panel-padded-10">
          Серверная ошибка валидации (422). Получено {requestValidationErrors.length} ошибок полей.
        </div>
      ) : null}

      {lastError && lastError.kind !== "validation" ? (
        <div className="panel panel-danger panel-padded-10 stack-4">
          <strong>{lastError.message}</strong>
          <span className="small-muted">ID запроса: {lastError.requestId ?? "-"}, ID трассировки: {lastError.traceId ?? "-"}</span>
        </div>
      ) : null}

      {importedRows > 0 ? (
        <div className="panel panel-success panel-padded-10">
          Импортировано позиций: {importedRows}.
        </div>
      ) : null}

      <div className="grid-main-aside">
        <div>{content}</div>

        <aside className="panel panel-padded-12 stack-10 align-start fit-content">
          <h3 className="section-title">Онлайн-превью риска</h3>
          <div className="small-muted">статус расчёта: {runStatusLabel(runStatus)}</div>
          <div className="small-muted">позиций: {positions.length}</div>
          <div className="small-muted">сценариев: {scenarios.length}</div>
          <div className="small-muted">последнее обновление: {result ? new Date().toLocaleTimeString() : "-"}</div>
          <div className="small-muted" title={`базовая стоимость: ${formatCurrency(result?.base_value ?? null, result?.base_currency ?? "RUB")}`}>
            <span className="numeric-value">базовая стоимость: {formatCurrency(result?.base_value ?? null, result?.base_currency ?? "RUB")}</span>
          </div>

          <CalculateButton />
          <button className="btn" onClick={resetDraft}>Сбросить черновик</button>

          {result?.pnl_distribution?.length ? (
            <MiniTrendChart values={result.pnl_distribution} />
          ) : (
            <div className="small-muted">Запустите расчёт, чтобы увидеть график превью.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
