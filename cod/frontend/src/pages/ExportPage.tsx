import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import Button from "../components/Button";
import Card from "../ui/Card";
import PageHeader from "../ui/PageHeader";
import StatePanel from "../ui/StatePanel";
import { useToast } from "../ui/Toast";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

type SectionKey = "Summary" | "Metrics" | "Greeks" | "Stress" | "Limits" | "Params" | "ValidationLog";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const { showToast } = useToast();
  const m = dataState.results.metrics;

  const [sections, setSections] = useState<SectionKey[]>(["Summary", "Metrics", "Greeks", "Stress", "Limits", "Params", "ValidationLog"]);

  const canExport = Boolean(m);

  const toggle = (s: SectionKey) => {
    setSections((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const summaryRows = useMemo(() => {
    const posCount = dataState.portfolio.positions.length;
    return [
      { key: "snapshotId", value: wf.snapshotId ?? "" },
      { key: "calcRunId", value: wf.calcRun.calcRunId ?? "" },
      { key: "positions", value: posCount },
      { key: "computedAt", value: dataState.results.computedAt ?? "" },
    ];
  }, [dataState.portfolio.positions.length, dataState.results.computedAt, wf.calcRun.calcRunId, wf.snapshotId]);

  return (
    <Card>
      <PageHeader
        kicker="Reports"
        title="Шаг 10. Отчёты и экспорт"
        subtitle="Выберите разделы отчёта и выгрузите JSON/Excel. Параметры расчёта и идентификаторы запуска включаются в отчёт."
        actions={
          <>
            <Button variant="secondary" onClick={() => nav("/dashboard")}>Назад: панель</Button>
            <Button variant="secondary" onClick={() => nav("/actions")}>Перейти к What‑if</Button>
          </>
        }
      />

      {!m ? (
        <StatePanel
          tone="warning"
          title="Нет результатов для экспорта"
          description="Сначала выполните расчёт. После этого отчёты будут доступны в JSON и Excel."
          action={<Button onClick={() => nav("/run")}>Перейти к запуску</Button>}
        />
      ) : (
        <div className="grid" style={{ marginTop: 12 }}>
          <Card>
            <div className="cardTitle">Конструктор отчёта</div>
            <div className="cardSubtitle">Можно убрать ненужные секции — файл будет проще.</div>
            <div className="stack" style={{ marginTop: 12 }}>
              {(["Summary", "Metrics", "Greeks", "Stress", "Limits", "Params", "ValidationLog"] as SectionKey[]).map((s) => (
                <label key={s} className="row" style={{ justifyContent: "space-between" }}>
                  <span className="row" style={{ gap: 10 }}>
                    <input type="checkbox" checked={sections.includes(s)} onChange={() => toggle(s)} style={{ width: 18, height: 18 }} />
                    <span style={{ fontWeight: 800 }}>{s}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <Button
                disabled={!canExport}
                onClick={() => {
                  const wb = XLSX.utils.book_new();

                  if (sections.includes("Summary")) {
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
                  }

                  if (sections.includes("Metrics")) {
                    const metricsRows = [
                      {
                        base_value: m.base_value,
                        var_hist: m.var_hist,
                        es_hist: m.es_hist,
                        var_param: m.var_param,
                        es_param: m.es_param,
                        lc_var: m.lc_var,
                        initial_margin: m.initial_margin,
                        variation_margin: m.variation_margin,
                        capital: m.capital,
                      },
                    ];
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metricsRows), "Metrics");
                  }

                  if (sections.includes("Greeks")) {
                    const greekRows = Object.entries(m.greeks ?? {}).map(([k, v]) => ({ greek: k, value: v }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(greekRows), "Greeks");
                  }

                  if (sections.includes("Stress")) {
                    const stressRows = (m.stress ?? []).map((s) => ({ scenario_id: s.scenario_id, pnl: s.pnl, limit: s.limit, breached: s.breached }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stressRows), "Stress");
                  }

                  if (sections.includes("Limits")) {
                    const limitRows = (m.limits ?? []).map(([metric, value, limit, breached]) => ({ metric, value, limit, breached }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(limitRows), "Limits");
                  }

                  if (sections.includes("Params")) {
                    const paramsRows = Object.entries(wf.calcConfig.params ?? {}).map(([k, v]) => ({ key: k, value: v }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paramsRows), "Params");
                  }

                  if (sections.includes("ValidationLog")) {
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataState.validationLog), "ValidationLog");
                  }

                  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
                  downloadBlob("risk_report.xlsx", new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
                  dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Export });
                  showToast("Excel-отчёт сформирован", "success");
                }}
              >
                Скачать отчёт (Excel)
              </Button>

              <Button
                variant="secondary"
                disabled={!canExport}
                onClick={() => {
                  const payload = {
                    summary: summaryRows,
                    metrics: m,
                    params: wf.calcConfig.params,
                    validationLog: dataState.validationLog,
                  };
                  downloadBlob("risk_report.json", new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }));
                  dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Export });
                  showToast("JSON-отчёт сформирован", "success");
                }}
              >
                Скачать отчёт (JSON)
              </Button>
            </div>
          </Card>

          <Card>
            <div className="cardTitle">Что будет внутри</div>
            <div className="cardSubtitle">Мини‑проверка, чтобы понимать, что экспорт действительно «не пустой».</div>
            <div className="stack" style={{ marginTop: 12 }}>
              <div>Сделок: <span className="code">{dataState.portfolio.positions.length}</span></div>
              <div>Сценариев: <span className="code">{dataState.scenarios.length}</span></div>
              <div>Ошибок валидации: <span className="code">{dataState.validationLog.filter((x) => x.severity === "ERROR").length}</span></div>
              <div className="textMuted">Форматирование — только в UI. В файлах сохраняем значения без округлений.</div>
            </div>
          </Card>
        </div>
      )}
    </Card>
  );
}
