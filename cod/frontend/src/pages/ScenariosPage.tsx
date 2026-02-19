import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import DataTable from "../ui/DataTable";
import FormField from "../ui/FormField";
import PageHeader from "../ui/PageHeader";
import Section from "../ui/Section";
import StatePanel from "../ui/StatePanel";
import { ConfigPreset, loadConfigPresets, loadRunHistory, RUN_HISTORY_STORAGE, saveConfigPresets, saveStoredList, RunSnapshot } from "../lib/scenarios";
import { formatNumber } from "../utils/format";

function metricDelta(next?: number | null, prev?: number | null): string {
  if (next == null || prev == null) return "—";
  const diff = next - prev;
  const prefix = diff > 0 ? "+" : "";
  return `${prefix}${formatNumber(diff)}`;
}

export default function ScenariosPage() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<ConfigPreset[]>(() => loadConfigPresets());
  const [history, setHistory] = useState<RunSnapshot[]>(() => loadRunHistory());

  const [leftRunId, setLeftRunId] = useState<string>(() => history[0]?.id ?? "");
  const [rightRunId, setRightRunId] = useState<string>(() => history[1]?.id ?? history[0]?.id ?? "");

  const leftRun = useMemo(() => history.find((item) => item.id === leftRunId), [history, leftRunId]);
  const rightRun = useMemo(() => history.find((item) => item.id === rightRunId), [history, rightRunId]);

  const comparisonRows = useMemo(
    () => [
      {
        id: "base_value",
        metric: "Portfolio value",
        left: leftRun?.metrics.base_value,
        right: rightRun?.metrics.base_value,
      },
      {
        id: "var_hist",
        metric: "VaR",
        left: leftRun?.metrics.var_hist,
        right: rightRun?.metrics.var_hist,
      },
      {
        id: "es_hist",
        metric: "ES",
        left: leftRun?.metrics.es_hist,
        right: rightRun?.metrics.es_hist,
      },
      {
        id: "lc_var",
        metric: "LC VaR",
        left: leftRun?.metrics.lc_var,
        right: rightRun?.metrics.lc_var,
      },
      {
        id: "initial_margin",
        metric: "Initial margin",
        left: leftRun?.metrics.initial_margin,
        right: rightRun?.metrics.initial_margin,
      },
    ],
    [leftRun, rightRun]
  );

  const removePreset = (id: string) => {
    const next = presets.filter((item) => item.id !== id);
    setPresets(next);
    saveConfigPresets(next);
  };

  return (
    <Card>
      <PageHeader
        kicker="Scenarios"
        title="Saved Configurations and Run Comparison"
        subtitle="Управляйте сохранёнными настройками и сравнивайте последние запуски side-by-side."
        actions={
          <>
            <Button onClick={() => navigate("/configure")}>Создать сценарий</Button>
            <Button variant="secondary" onClick={() => navigate("/run")}>Новый запуск</Button>
          </>
        }
      />

      <Section title="Saved Configurations" helper="Сценарии из шага настройки сохраняются в localStorage.">
        {presets.length === 0 ? (
          <StatePanel
            tone="info"
            title="Пока нет сохранённых конфигураций"
            description="Откройте страницу настройки расчёта и сохраните первый сценарий."
            action={<Button variant="secondary" onClick={() => navigate("/configure")}>Перейти к настройке</Button>}
          />
        ) : (
          <DataTable
            rows={presets}
            rowKey={(row) => row.id}
            columns={[
              { key: "name", header: "Сценарий", render: (row) => row.name },
              { key: "metrics", header: "Метрик", render: (row) => row.selected.length },
              { key: "alpha", header: "CL", render: (row) => row.params.alpha.toFixed(4) },
              { key: "horizon", header: "Горизонт", render: (row) => `${row.params.horizonDays}d` },
              { key: "currency", header: "Валюта", render: (row) => row.params.baseCurrency },
              {
                key: "actions",
                header: "",
                render: (row) => (
                  <Button variant="ghost" onClick={() => removePreset(row.id)}>
                    Удалить
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Section>

      <Section
        title="Compare Last Runs"
        helper="Минимальный compare-view: выберите два запуска и оцените изменение ключевых KPI."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              saveStoredList(RUN_HISTORY_STORAGE, [] as RunSnapshot[]);
              setHistory([]);
              setLeftRunId("");
              setRightRunId("");
            }}
            disabled={history.length === 0}
          >
            Очистить историю
          </Button>
        }
      >
        {history.length === 0 ? (
          <StatePanel
            tone="warning"
            title="История запусков пуста"
            description="После успешного расчёта в разделе запуска появятся снапшоты для сравнения."
          />
        ) : (
          <>
            <div className="grid" style={{ marginTop: 8 }}>
              <FormField label="Запуск A" helper="Базовый запуск для сравнения.">
                <select value={leftRunId} onChange={(e) => setLeftRunId(e.target.value)}>
                  {history.map((run) => (
                    <option key={run.id} value={run.id}>
                      {new Date(run.createdAt).toLocaleString("ru-RU")} · {run.scope} · {run.positionCount} поз.
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Запуск B" helper="Новый запуск, с которым сравниваем.">
                <select value={rightRunId} onChange={(e) => setRightRunId(e.target.value)}>
                  {history.map((run) => (
                    <option key={run.id} value={run.id}>
                      {new Date(run.createdAt).toLocaleString("ru-RU")} · {run.scope} · {run.positionCount} поз.
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <DataTable
              rows={comparisonRows}
              rowKey={(row) => row.id}
              columns={[
                { key: "metric", header: "Метрика", render: (row) => row.metric },
                { key: "left", header: "Run A", render: (row) => (row.left == null ? "—" : formatNumber(row.left)) },
                { key: "right", header: "Run B", render: (row) => (row.right == null ? "—" : formatNumber(row.right)) },
                { key: "delta", header: "Δ", render: (row) => metricDelta(row.right, row.left) },
              ]}
            />

            <div className="row wrap" style={{ marginTop: 10 }}>
              <Button variant="secondary" onClick={() => navigate("/results")}>Открыть результаты</Button>
              <Button variant="secondary" onClick={() => navigate("/reports")}>Открыть отчёты</Button>
            </div>
          </>
        )}
      </Section>
    </Card>
  );
}
