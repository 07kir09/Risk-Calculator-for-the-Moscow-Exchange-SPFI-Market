import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chip } from "@heroui/react";
import * as XLSX from "xlsx";
import AppCheckbox from "../components/AppCheckbox";
import Button from "../components/Button";
import Card from "../ui/Card";
import {
  CompareBarsChart,
  CircularScore,
  GlassPanel,
  Reveal,
  Sparkline,
  StaggerGroup,
  StaggerItem,
} from "../components/rich/RichVisuals";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

type SectionKey = "Summary" | "Metrics" | "Greeks" | "Stress" | "Limits" | "Params" | "ValidationLog";

const sectionMeta: Record<SectionKey, { title: string; hint: string }> = {
  Summary: { title: "Сводка расчёта", hint: "Идентификаторы запуска, время расчёта и объём портфеля." },
  Metrics: { title: "Ключевые метрики", hint: "Base value, VaR, ES, LC VaR, капитал и маржа." },
  Greeks: { title: "Чувствительности", hint: "Delta, Vega, DV01 и другие драйверы риска." },
  Stress: { title: "Стресс-сценарии", hint: "P&L по каждому сценарию и факт превышения." },
  Limits: { title: "Лимиты", hint: "Сравнение метрик с заданными порогами." },
  Params: { title: "Параметры расчёта", hint: "Конфигурация методики и выбранные настройки." },
  ValidationLog: { title: "Лог валидации", hint: "Ошибки и предупреждения, обнаруженные до расчёта." },
};

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
  const m = dataState.results.metrics;

  const [sections, setSections] = useState<SectionKey[]>(["Summary", "Metrics", "Greeks", "Stress", "Limits", "Params", "ValidationLog"]);

  const canExport = Boolean(m);
  const sectionBars = useMemo(
    () =>
      (["Summary", "Metrics", "Greeks", "Stress", "Limits", "Params", "ValidationLog"] as SectionKey[]).map((section) => ({
        label: sectionMeta[section].title.split(" ")[0] ?? section,
        value: sections.includes(section) ? 100 : 18,
        tone: sections.includes(section) ? "positive" as const : "neutral" as const,
      })),
    [sections]
  );
  const exportReadiness = useMemo(
    () => (canExport ? Math.max(32, Math.round((sections.length / 7) * 100)) : 0),
    [canExport, sections.length]
  );
  const exportSpark = useMemo(
    () => sectionBars.slice(0, 7).map((item, index) => ({ label: `${index + 1}`, value: item.value })),
    [sectionBars]
  );

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
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 10. Отчёты и экспорт</h1>
          <p className="pageHint">
            Выберите, какие разделы включить в отчёт, и выгрузите CSV/Excel. В отчёт всегда попадают параметры расчёта и идентификаторы запуска.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/dashboard")}>Назад: панель</Button>
          <Button variant="secondary" onClick={() => nav("/actions")}>Перейти к What‑if</Button>
        </div>
      </div>

      {!m ? (
        <Card>
          <div className="pageEmptyState">
            <div className="badge warn">Нет результатов. Сначала запустите расчёт.</div>
            <div className="pageEmptyActions">
              <Button onClick={() => nav("/dashboard")}>Перейти к результатам</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid pageSection--tight">
          <StaggerGroup className="visualSplitPanel">
            <StaggerItem>
              <GlassPanel
                title="Профиль отчёта"
                subtitle="Левый блок отвечает на вопрос “насколько полный отчёт получится”, правый — какие секции в него попадут."
                badge={<Chip color="primary" variant="flat" radius="sm">{sections.length} секц.</Chip>}
              >
                <div className="visualSplitPanel">
                  <CircularScore value={exportReadiness} label="Готовность экспорта" color="primary" hint="Заполняется по выбранным секциям" />
                  <CompareBarsChart data={sectionBars} height={240} />
                </div>
              </GlassPanel>
            </StaggerItem>
            <StaggerItem>
              <GlassPanel title="Ритм наполнения" subtitle="Sparkline помогает быстро понять, насколько отчёт будет компактным или плотным.">
                <Sparkline data={exportSpark} color="#7da7ff" height={96} />
              </GlassPanel>
            </StaggerItem>
          </StaggerGroup>

          <Reveal delay={0.06}>
            <Card>
            <div className="cardTitle">Конструктор отчёта</div>
            <div className="cardSubtitle">Можно убрать ненужные секции — файл будет проще.</div>
            <div className="stack pageSection--tight">
              {(["Summary", "Metrics", "Greeks", "Stress", "Limits", "Params", "ValidationLog"] as SectionKey[]).map((s) => (
                <div key={s} className="checkRow">
                  <AppCheckbox
                    id={`export-section-${s}`}
                    isSelected={sections.includes(s)}
                    onChange={() => toggle(s)}
                    size="sm"
                    radius="sm"
                    label={<span className="checkRowTitle">{sectionMeta[s].title}</span>}
                    description={<span className="checkRowHint">{sectionMeta[s].hint}</span>}
                  />
                </div>
              ))}
            </div>
            <div className="inlineActions pageSection--tight">
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
                }}
              >
                Скачать отчёт (JSON)
              </Button>
            </div>
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card>
            <div className="cardTitle">Что будет внутри</div>
            <div className="cardSubtitle">Мини‑проверка, чтобы понимать, что экспорт действительно «не пустой».</div>
            <div className="detailList pageSection--tight">
              <div className="detailListRow">
                <span>Сделок</span>
                <strong>{dataState.portfolio.positions.length}</strong>
              </div>
              <div className="detailListRow">
                <span>Сценариев</span>
                <strong>{dataState.scenarios.length}</strong>
              </div>
              <div className="detailListRow">
                <span>Ошибок валидации</span>
                <strong>{dataState.validationLog.filter((x) => x.severity === "ERROR").length}</strong>
              </div>
              <div className="textMuted">Форматирование используется только в интерфейсе. В файл уходит исходная точность значений.</div>
            </div>
            </Card>
          </Reveal>
        </div>
      )}
    </Card>
  );
}
