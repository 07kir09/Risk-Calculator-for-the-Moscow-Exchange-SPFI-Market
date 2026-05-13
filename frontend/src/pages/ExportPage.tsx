import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Chip } from "@heroui/react";
import * as XLSX from "xlsx";
import AppCheckbox from "../components/AppCheckbox";
import AppTable from "../components/AppTable";
import Button from "../components/Button";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { limitSourceDescription, limitSourceLabel } from "../lib/limitSource";
import { applyAutoLimits, isDemoDefaultLimitRows, isDemoDefaultLimits } from "../lib/autoLimits";
import { attachMethodologyMetadata, buildMethodologyMetadata } from "../lib/methodology";

type SectionKey = "Summary" | "Metrics" | "Greeks" | "Stress" | "Limits" | "Params" | "DataQuality" | "ValidationLog";

const sectionMeta: Record<SectionKey, { title: string; hint: string }> = {
  Summary: { title: "Сводка расчёта", hint: "ID запуска, дата и размер портфеля." },
  Metrics: { title: "Ключевые метрики", hint: "Base value, VaR, ES, LC VaR и связанные показатели." },
  Greeks: { title: "Чувствительности", hint: "Delta, Vega, DV01 и другие драйверы риска." },
  Stress: { title: "Стресс-сценарии", hint: "P&L по сценариям и статус превышения." },
  Limits: { title: "Контрольные пороги", hint: "Сравнение факта с текущим порогом по метрикам." },
  Params: { title: "Параметры расчёта", hint: "Конфигурация методики и входные настройки." },
  DataQuality: { title: "Качество данных", hint: "Статус полноты market-data и список недостающих факторов." },
  ValidationLog: { title: "Лог валидации", hint: "Ошибки и предупреждения перед расчётом." },
};

const allSections: SectionKey[] = ["Summary", "Metrics", "Greeks", "Stress", "Limits", "Params", "DataQuality", "ValidationLog"];

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
  const storedMetrics = dataState.results.metrics;
  const metrics = useMemo(() => {
    if (!storedMetrics) return null;
    if (!dataState.limits || isDemoDefaultLimits(dataState.limits) || isDemoDefaultLimitRows(storedMetrics.limits)) {
      return attachMethodologyMetadata(applyAutoLimits(storedMetrics), "draft_auto");
    }
    return attachMethodologyMetadata(storedMetrics, dataState.limitSource ?? "manual_user");
  }, [dataState.limitSource, dataState.limits, storedMetrics]);

  const [sections, setSections] = useState<SectionKey[]>(allSections);
  const canExport = Boolean(metrics);

  const sectionCoverage = useMemo(
    () => (canExport ? Math.round((sections.length / allSections.length) * 100) : 0),
    [canExport, sections.length]
  );
  const validationRows = useMemo(
    () => [
      ...dataState.validationLog.map((entry) => ({ source: "import", ...entry })),
      ...(metrics?.validation_log ?? []).map((entry) => ({ source: "calculation", ...entry })),
    ],
    [dataState.validationLog, metrics?.validation_log]
  );
  const validationErrors = useMemo(
    () => validationRows.filter((entry) => entry.severity === "ERROR").length,
    [validationRows]
  );
  const validationWarnings = useMemo(
    () => validationRows.filter((entry) => entry.severity === "WARNING").length,
    [validationRows]
  );

  const toggle = (section: SectionKey) => {
    setSections((prev) => (prev.includes(section) ? prev.filter((value) => value !== section) : [...prev, section]));
  };

  const summaryRows = useMemo(() => {
    const posCount = dataState.portfolio.positions.length;
    return [
      { key: "snapshotId", value: wf.snapshotId ?? "" },
      { key: "calcRunId", value: wf.calcRun.calcRunId ?? "" },
      { key: "positions", value: posCount },
      { key: "computedAt", value: dataState.results.computedAt ?? "" },
      { key: "calculation_status", value: metrics?.calculation_status ?? "" },
      { key: "market_data_completeness", value: metrics?.data_quality?.market_data_completeness ?? metrics?.market_data_completeness ?? "" },
      { key: "valuation_label", value: metrics?.valuation_label ?? "Net PV / MtM" },
      { key: "var_method", value: metrics?.var_method ?? "scenario_quantile" },
      { key: "warning_count", value: validationWarnings },
      { key: "error_count", value: validationErrors },
    ];
  }, [
    dataState.portfolio.positions.length,
    dataState.results.computedAt,
    metrics?.calculation_status,
    metrics?.data_quality?.market_data_completeness,
    metrics?.market_data_completeness,
    metrics?.valuation_label,
    metrics?.var_method,
    validationErrors,
    validationWarnings,
    wf.calcRun.calcRunId,
    wf.snapshotId,
  ]);
  const methodologyMetadata = useMemo(
    () => buildMethodologyMetadata({ metrics, limitSource: metrics?.limit_source ?? dataState.limitSource ?? "draft_auto" }),
    [dataState.limitSource, metrics]
  );
  const methodologyRows = useMemo(
    () => Object.entries(methodologyMetadata).map(([key, value]) => ({ key, value: value ?? "" })),
    [methodologyMetadata]
  );
  const dataQualityRows = useMemo(() => {
    const quality = metrics?.data_quality;
    return [
      { key: "calculation_status", value: metrics?.calculation_status ?? "" },
      { key: "market_data_completeness", value: quality?.market_data_completeness ?? metrics?.market_data_completeness ?? "" },
      { key: "missing_curves", value: (quality?.missing_curves ?? []).join(", ") },
      { key: "missing_fx", value: (quality?.missing_fx ?? []).join(", ") },
      { key: "affected_positions", value: (quality?.affected_positions ?? []).join(", ") },
      { key: "partial_positions_count", value: quality?.partial_positions_count ?? 0 },
      { key: "market_data_source", value: metrics?.market_data_source ?? "" },
      { key: "methodology_status", value: metrics?.methodology_status ?? methodologyMetadata.methodology_status },
      { key: "valuation_label", value: metrics?.valuation_label ?? "Net PV / MtM" },
      { key: "var_method", value: metrics?.var_method ?? methodologyMetadata.var_method },
      { key: "warnings", value: (quality?.warnings ?? []).join(" | ") },
    ];
  }, [methodologyMetadata.methodology_status, methodologyMetadata.var_method, metrics]);

  const downloadExcelReport = () => {
    if (!metrics) return;
    const wb = XLSX.utils.book_new();
    const exportMethodologyRows = Object.entries(
      buildMethodologyMetadata({
        metrics,
        limitSource: metrics.limit_source ?? dataState.limitSource ?? "draft_auto",
        exportGeneratedAt: new Date().toISOString(),
      })
    ).map(([key, value]) => ({ key, value: value ?? "" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportMethodologyRows), "Methodology");

    if (sections.includes("Summary")) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    }
    if (sections.includes("Metrics")) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          {
            base_value: metrics.base_value,
            net_pv_mtm: metrics.base_value,
            valuation_label: metrics.valuation_label ?? "Net PV / MtM",
            var_hist: metrics.var_hist,
            var_method: metrics.var_method ?? methodologyMetadata.var_method,
            es_hist: metrics.es_hist,
            var_param: metrics.var_param,
            es_param: metrics.es_param,
            lc_var: metrics.lc_var,
            lc_var_addon: metrics.lc_var_addon,
            worst_stress: metrics.worst_stress,
            initial_margin: metrics.initial_margin,
            reference_scenario_pnl: metrics.variation_margin,
            variation_margin: metrics.variation_margin,
            capital: metrics.capital,
            base_currency: metrics.base_currency,
            confidence_level: metrics.confidence_level,
            horizon_days: metrics.horizon_days,
            mode: metrics.mode,
            liquidity_model: metrics.liquidity_model,
            calculation_status: metrics.calculation_status,
            market_data_completeness: metrics.data_quality?.market_data_completeness ?? metrics.market_data_completeness,
          },
        ]),
        "Metrics"
      );
    }
    if (sections.includes("Greeks")) {
      const greekRows = Object.entries(metrics.greeks ?? {}).map(([key, value]) => ({ greek: key, value }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(greekRows), "Greeks");
    }
    if (sections.includes("Stress")) {
      const stressRows = (metrics.stress ?? []).map((row) => ({
        scenario_id: row.scenario_id,
        pnl: row.pnl,
        limit: row.limit,
        breached: row.breached,
        stress_source: methodologyMetadata.stress_source,
        backend_calculated: methodologyMetadata.backend_calculated,
        preliminary: methodologyMetadata.preliminary,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stressRows), "Stress");
    }
    if (sections.includes("Limits")) {
      const limitRows = (metrics.limits ?? []).map(([metric, value, limit, breached]) => ({
        metric,
        value,
        limit,
        breached,
        limit_source: methodologyMetadata.limit_source,
        methodology_status: methodologyMetadata.methodology_status,
        preliminary: methodologyMetadata.preliminary,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(limitRows), "Limits");
    }
    if (sections.includes("Params")) {
      const paramsRows = Object.entries(wf.calcConfig.params ?? {}).map(([key, value]) => ({ key, value }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paramsRows), "Params");
    }
    if (sections.includes("DataQuality")) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataQualityRows), "DataQuality");
    }
    if (sections.includes("ValidationLog")) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(validationRows), "ValidationLog");
    }

    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    downloadBlob("risk_report.xlsx", new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Export });
  };

  const downloadJsonReport = () => {
    if (!metrics) return;
    const payload = {
      summary: summaryRows,
      methodology_metadata: buildMethodologyMetadata({
        metrics,
        limitSource: metrics.limit_source ?? dataState.limitSource ?? "draft_auto",
        exportGeneratedAt: new Date().toISOString(),
      }),
      selectedSections: sections,
      data_quality: metrics.data_quality,
      metrics,
      params: wf.calcConfig.params,
      validationLog: validationRows,
    };
    downloadBlob("risk_report.json", new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }));
    dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Export });
  };

  return (
    <div className="importPagePlain dashboardPage dashboardPage--revamp exportPage">
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Экспорт</h1>
          <div className="importHeroMeta">
            <Chip color={canExport ? "success" : "warning"} variant="soft" radius="sm" size="sm">
              {canExport ? "Данные готовы к выгрузке" : "Нет результатов для выгрузки"}
            </Chip>
            <span className="importFileTag">{sections.length} секций выбрано</span>
            {canExport ? <span className="importFileTag">methodology_status: {methodologyMetadata.methodology_status}</span> : null}
          </div>
        </div>
      </div>

      {!metrics ? (
        <Card>
          <div className="pageEmptyState">
            <div className="badge warn">Нет результатов. Сначала выполните расчёт.</div>
            <div className="pageEmptyActions">
              <Button onClick={() => nav("/dashboard")}>Перейти к результатам</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <section className="dashboardSection">
            <div className="dashboardSectionHead">
              <div className="dashboardSectionIntro">
                <div className="dashboardSectionEyebrow">Выгрузка</div>
                <h2 className="dashboardSectionTitle">Пакет отчёта</h2>
                <p className="dashboardSectionText">Проверьте состав файла и методологический статус перед выгрузкой Excel или JSON.</p>
              </div>
              <div className="dashboardSectionMeta">
                <span className="dashboardSectionTag">{sections.length} / {allSections.length} секций</span>
                <span className="dashboardSectionTag">{sectionCoverage}% покрытие секций</span>
              </div>
            </div>
            <div className="dashboardSectionBody">
              <div className="dashboardKpiGrid exportKpiGrid">
                <div className="dashboardKpiCard dashboardKpiCard--success">
                  <span className="dashboardKpiLabel">Покрытие секций</span>
                  <strong className="dashboardKpiValue">{sectionCoverage}%</strong>
                  <span className="dashboardKpiMeta">по выбранным секциям</span>
                </div>
                <div className="dashboardKpiCard">
                  <span className="dashboardKpiLabel">Секции</span>
                  <strong className="dashboardKpiValue">{sections.length}</strong>
                  <span className="dashboardKpiMeta">будут добавлены в файл</span>
                </div>
                <div className="dashboardKpiCard">
                  <span className="dashboardKpiLabel">Сделки</span>
                  <strong className="dashboardKpiValue">{dataState.portfolio.positions.length}</strong>
                  <span className="dashboardKpiMeta">в текущем портфеле</span>
                </div>
                <div className={`dashboardKpiCard ${validationErrors ? "dashboardKpiCard--warning" : ""}`}>
                  <span className="dashboardKpiLabel">Ошибки</span>
                  <strong className="dashboardKpiValue">{validationErrors}</strong>
                  <span className="dashboardKpiMeta">в журнале валидации</span>
                </div>
              </div>
            </div>
          </section>

          <section className="dashboardSection">
            <div className="dashboardSectionHead">
              <div className="dashboardSectionIntro">
                <div className="dashboardSectionEyebrow">Состав</div>
                <h2 className="dashboardSectionTitle">Конструктор секций</h2>
              </div>
            </div>
            <div className="dashboardSectionBody">
              <Card>
                <div className="cardTitle">Методологический статус</div>
                <div className="cardSubtitle">
                  Источник порогов: {limitSourceLabel(methodologyMetadata.limit_source)}. {limitSourceDescription(methodologyMetadata.limit_source)}
                </div>
                <AppTable
                  ariaLabel="Методологические метаданные"
                  headers={["Поле", "Значение"]}
                  rows={methodologyRows.map((row) => ({
                    key: row.key,
                    cells: [row.key, String(row.value)],
                  }))}
                />
              </Card>
              <div className="dashboardCoreGrid exportCoreGrid">
                <Card>
                  <div className="cardTitle">Покрытие отчёта</div>
                  <div className="cardSubtitle">Быстрая проверка, какие блоки включены в выгрузку.</div>
                  <div className="exportCoverageList pageSection--tight">
                    {allSections.map((section) => {
                      const selected = sections.includes(section);
                      return (
                        <div key={section} className={`exportCoverageRow ${selected ? "exportCoverageRow--selected" : ""}`}>
                          <span>{sectionMeta[section].title}</span>
                          <Chip color={selected ? "success" : "default"} variant="flat" radius="sm" size="sm">
                            {selected ? "в отчёте" : "выключено"}
                          </Chip>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card>
                  <div className="cardTitle">Форматы</div>
                  <div className="cardSubtitle">Excel удобен для проверки таблиц, JSON — для машинной проверки и архива результатов. JSON выгружает полный payload с metadata.</div>
                  <div className="detailList pageSection--tight">
                    <div className="detailListRow">
                      <span>Excel</span>
                      <strong>{sections.length} sheets</strong>
                    </div>
                    <div className="detailListRow">
                      <span>JSON</span>
                      <strong>raw metrics</strong>
                    </div>
                    <div className="detailListRow">
                      <span>Точность</span>
                      <strong>исходная</strong>
                    </div>
                  </div>
                  <div className="inlineActions pageSection--tight">
                    <Button aria-label="Скачать отчёт (Excel)" disabled={!canExport} onClick={downloadExcelReport}>
                      Скачать Excel
                    </Button>
                    <Button variant="secondary" disabled={!canExport} onClick={downloadJsonReport}>
                      Скачать JSON
                    </Button>
                    <Button variant="secondary" onClick={() => nav("/limits")}>
                      Лимиты
                    </Button>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="cardTitle">Выбор секций</div>
                <div className="cardSubtitle">Оставьте только нужные блоки, чтобы отчёт был компактным.</div>
                <div className="exportSectionGrid pageSection--tight">
                  {allSections.map((section) => (
                    <div key={section} className="checkRow">
                      <AppCheckbox
                        id={`export-section-${section}`}
                        isSelected={sections.includes(section)}
                        onChange={() => toggle(section)}
                        size="sm"
                        radius="sm"
                        label={<span className="checkRowTitle">{sectionMeta[section].title}</span>}
                        description={<span className="checkRowHint">{sectionMeta[section].hint}</span>}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
