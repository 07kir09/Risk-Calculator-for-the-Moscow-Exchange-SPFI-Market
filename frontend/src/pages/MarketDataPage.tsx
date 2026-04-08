import { useEffect, useMemo, useState } from "react";
import { Chip, Progress, Tab, Tabs } from "@heroui/react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { fetchMarketDataSession, loadDefaultMarketDataBundle, uploadMarketDataBundleFile } from "../api/endpoints";
import { MarketDataSessionSummary } from "../api/contracts/marketData";
import Button from "../components/Button";
import FileDropzone from "../components/FileDropzone";
import Card from "../ui/Card";
import {
  CircularScore,
  CompareBarsChart,
  GlassPanel,
  LineTrendChart,
  Reveal,
  Sparkline,
  StaggerGroup,
  StaggerItem,
} from "../components/rich/RichVisuals";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

function uploadKindLabel(kind: string) {
  switch (kind) {
    case "curve_discount":
      return "curveDiscount";
    case "curve_forward":
      return "curveForward";
    case "fixing":
      return "fixing";
    case "calibration":
      return "calibrationInstrument";
    case "fx_history":
      return "RC_*";
    default:
      return kind;
  }
}

export default function MarketDataPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const [localLoading, setLocalLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const hasPortfolio = dataState.portfolio.positions.length > 0;
  const summary = dataState.marketDataSummary;

  const applySummary = (nextSummary: MarketDataSessionSummary, note?: string) => {
    dataDispatch({ type: "SET_MARKET_DATA_SUMMARY", summary: nextSummary });
    dataDispatch({ type: "RESET_RESULTS" });
    dispatch({ type: "RESET_DOWNSTREAM", fromStep: WorkflowStep.MarketData });

    const missingFactors = nextSummary.blocking_errors;
    dispatch({
      type: "SET_MARKET_STATUS",
      missingFactors,
      status: nextSummary.ready ? "ready" : "idle",
    });

    if (nextSummary.ready) {
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
    }

    if (note) setStatusText(note);
  };

  useEffect(() => {
    if (!summary?.session_id) return;
    let cancelled = false;
    fetchMarketDataSession(summary.session_id)
      .then((fresh) => {
        if (cancelled) return;
        dataDispatch({ type: "SET_MARKET_DATA_SUMMARY", summary: fresh });
        const missingFactors = fresh.blocking_errors;
        dispatch({
          type: "SET_MARKET_STATUS",
          missingFactors,
          status: fresh.ready ? "ready" : "idle",
        });
        if (fresh.ready) {
          dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
        }
      })
      .catch(() => {
        // keep last persisted summary if backend is temporarily unavailable
      });
    return () => {
      cancelled = true;
    };
  }, [dataDispatch, dispatch, summary?.session_id]);

  const isReady = summary?.ready ?? false;
  const blockingErrors = summary?.blocking_errors ?? 0;
  const warnings = summary?.warnings ?? 0;
  const missingRequired = summary?.missing_required_files ?? ["curveDiscount.xlsx", "curveForward.xlsx", "fixing.xlsx"];

  const readiness = summary
    ? Math.max(0, Math.min(100, 100 - missingRequired.length * 20 - blockingErrors * 15))
    : 0;

  const coverageBars = useMemo(
    () => [
      { label: "Discount", value: summary?.counts.discount_curves ? 100 : 16, tone: summary?.counts.discount_curves ? ("positive" as const) : ("negative" as const) },
      { label: "Forward", value: summary?.counts.forward_curves ? 100 : 16, tone: summary?.counts.forward_curves ? ("positive" as const) : ("negative" as const) },
      { label: "Fixings", value: summary?.counts.fixings ? 100 : 16, tone: summary?.counts.fixings ? ("positive" as const) : ("negative" as const) },
      { label: "Calibration", value: summary?.counts.calibration_instruments ? 100 : 24, tone: summary?.counts.calibration_instruments ? ("neutral" as const) : ("negative" as const) },
      { label: "FX", value: summary?.counts.fx_history ? 100 : 24, tone: summary?.counts.fx_history ? ("neutral" as const) : ("negative" as const) },
    ],
    [summary]
  );

  const trendData = useMemo(
    () => [
      { label: "Files", value: summary?.files.length ? Math.min(100, summary.files.length * 12) : 0 },
      { label: "Rows", value: Math.min(100, ((summary?.counts.discount_curves ?? 0) + (summary?.counts.forward_curves ?? 0)) > 0 ? 86 : 0) },
      { label: "Checks", value: summary ? Math.max(10, 100 - blockingErrors * 20) : 0 },
      { label: "Ready", value: readiness },
    ],
    [blockingErrors, readiness, summary]
  );

  const uploadOne = async (file: File) => {
    setLocalLoading(true);
    setStatusText(null);
    dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "loading" });
    try {
      const nextSummary = await uploadMarketDataBundleFile(file, summary?.session_id);
      applySummary(nextSummary, `Файл ${file.name} добавлен в market data bundle.`);
    } catch (error: any) {
      dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "idle" });
      setStatusText(error?.message ?? `Не удалось загрузить ${file.name}.`);
    } finally {
      setLocalLoading(false);
    }
  };

  const loadLocalDatasets = async () => {
    setLocalLoading(true);
    setStatusText(null);
    dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "loading" });
    try {
      const nextSummary = await loadDefaultMarketDataBundle();
      applySummary(nextSummary, "Локальная папка Datasets загружена в market data session.");
    } catch (error: any) {
      dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "idle" });
      setStatusText(error?.message ?? "Не удалось загрузить локальный Datasets.");
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Рыночные данные</h1>
          <p className="pageHint">
            Здесь собирается market data bundle из Excel-файлов: curve curves, fixings, calibrationInstrument и RC-history. Любой файл из папки Datasets можно загружать по одному или подтянуть весь набор сразу.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/validate")}>
            Назад
          </Button>
          <Chip color={isReady ? "success" : localLoading ? "warning" : "default"} variant="flat" radius="sm">
            {isReady ? "Bundle готов" : localLoading ? "Обновляем bundle" : "Bundle не завершён"}
          </Chip>
        </div>
      </div>

      <div className="runLayout">
        <div className="runMain">
          <StaggerGroup className="visualSplitPanel">
            <StaggerItem>
              <GlassPanel
                title="Готовность market data"
                subtitle="Шаг больше не фейковый: статус идёт от backend summary по реальным Excel-файлам."
                badge={
                  <Chip color={isReady ? "success" : blockingErrors > 0 ? "danger" : "warning"} variant="flat" radius="sm">
                    {Math.round(readiness)}%
                  </Chip>
                }
              >
                <div className="visualSplitPanel">
                  <CircularScore
                    value={readiness}
                    label="Bundle"
                    color={isReady ? "success" : blockingErrors > 0 ? "danger" : "warning"}
                    hint={isReady ? "Обязательные файлы на месте, bundle можно передавать в расчёт." : "Загрузи отсутствующие файлы и проверь замечания."}
                  />
                  <LineTrendChart data={trendData} color="#7da7ff" secondaryColor="#6eff8e" showSecondary={false} />
                </div>
              </GlassPanel>
            </StaggerItem>
            <StaggerItem>
              <GlassPanel title="Покрытие bundle" subtitle="Каждый столбец отвечает на один вопрос: этот слой данных уже в сессии или ещё нет.">
                <CompareBarsChart data={coverageBars} height={220} />
                <Sparkline data={trendData} color={isReady ? "#6eff8e" : "#ffb86a"} height={84} />
              </GlassPanel>
            </StaggerItem>
          </StaggerGroup>

          <Reveal delay={0.06}>
            <Card>
              <div className="importUploadHeader">
                <div>
                  <div className="cardTitle">Загрузка market data bundle</div>
                  <div className="cardSubtitle">Поддерживаются: `curveDiscount`, `curveForward`, `fixing`, `calibrationInstrument*`, `RC_*`.</div>
                </div>
                <div className="pageActions">
                  <Button variant="secondary" loading={localLoading} disabled={localLoading} onClick={loadLocalDatasets}>
                    Подтянуть папку Datasets
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!isReady || !hasPortfolio}
                    onClick={() => {
                      flushSync(() => {
                        dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
                      });
                      nav("/configure");
                    }}
                  >
                    К настройке расчёта
                  </Button>
                </div>
              </div>

              <FileDropzone
                accept=".xlsx,.xls"
                disabled={localLoading}
                title={localLoading ? "Обновляем market data..." : "Перетащите сюда любой файл из Datasets"}
                subtitle="Можно загружать по одному: bundle будет собираться по мере добавления файлов"
                onFile={uploadOne}
              />

              {statusText && (
                <Chip color={statusText.includes("Не удалось") ? "danger" : "success"} variant="flat" radius="sm" className="importIssueChip">
                  {statusText}
                </Chip>
              )}

              <div className="runKpiGrid">
                <div className="importKpiCard">
                  <span>Файлы в сессии</span>
                  <strong>{summary?.files.length ?? 0}</strong>
                </div>
                <div className="importKpiCard">
                  <span>Блокирующие ошибки</span>
                  <strong className={blockingErrors > 0 ? "isNegative" : ""}>{blockingErrors}</strong>
                </div>
                <div className="importKpiCard">
                  <span>Предупреждения</span>
                  <strong>{warnings}</strong>
                </div>
              </div>

              <Progress
                aria-label="Готовность market data bundle"
                value={readiness}
                color={isReady ? "success" : blockingErrors > 0 ? "danger" : "warning"}
                className="importProgress"
              />
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card>
              <Tabs
                aria-label="Статус market data bundle"
                radius="sm"
                color="primary"
                classNames={{
                  tabList: "importTabsList",
                  tab: "importTab",
                  cursor: "importTabCursor",
                  panel: "importTabPanel",
                }}
              >
                <Tab key="files" title={`Файлы (${summary?.files.length ?? 0})`}>
                  <div className="scenarioPreviewList">
                    {summary?.files.length ? (
                      summary.files.map((file) => (
                        <div key={file.filename} className="scenarioPreviewItem">
                          <div>
                            <strong>{file.filename}</strong>
                            <div className="textMuted">{uploadKindLabel(file.kind)} · {(file.size_bytes / 1024).toFixed(1)} KB</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="textMuted">Пока не загружено ни одного market data файла.</div>
                    )}
                  </div>
                </Tab>

                <Tab key="missing" title={`Не хватает (${missingRequired.length})`}>
                  {missingRequired.length ? (
                    <div className="scenarioPreviewList">
                      {missingRequired.map((name) => (
                        <div key={name} className="scenarioPreviewItem">
                          <div>
                            <strong>{name}</strong>
                            <div className="textMuted">Этот файл обязателен для готового bundle.</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="textMuted">Обязательные файлы все на месте.</div>
                  )}
                </Tab>

                <Tab key="log" title={`Замечания (${(summary?.validation_log.length ?? 0)})`}>
                  <div className="scenarioPreviewList">
                    {summary?.validation_log.length ? (
                      summary.validation_log.map((entry, index) => (
                        <div key={`${entry.message}-${index}`} className="scenarioPreviewItem">
                          <div>
                            <strong>{entry.severity}</strong>
                            <div className="textMuted">{entry.message}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="textMuted">Пока замечаний нет.</div>
                    )}
                  </div>
                </Tab>
              </Tabs>
            </Card>
          </Reveal>
        </div>

        <aside className="importAside">
          <Card>
            <div className="cardTitle">Что важно</div>
            <div className="cardSubtitle">
              Portfolio и market data теперь разделены. Файлы из `Datasets` не должны грузиться как сделки: их место на этом шаге.
            </div>
          </Card>

          <Card>
            <div className="cardTitle">Следующий шаг</div>
            <div className="cardSubtitle">
              {isReady
                ? hasPortfolio
                  ? "Bundle готов. Можно идти к настройке расчёта."
                  : "Bundle готов. Теперь загрузи портфель и переходи к расчёту."
                : "Сначала доведи bundle до готовности: обязательные файлы должны быть загружены, а блокирующих ошибок быть не должно."}
            </div>
          </Card>
        </aside>
      </div>
    </Card>
  );
}
