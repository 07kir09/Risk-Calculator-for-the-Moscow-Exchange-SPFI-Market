import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { fetchMarketDataSession, uploadMarketDataBundleFile } from "../api/endpoints";
import { MarketDataSessionSummary } from "../api/contracts/marketData";
import FileDropzone from "../components/FileDropzone";
import { Reveal } from "../components/rich/RichVisuals";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

function uploadKindLabel(kind: string) {
  switch (kind) {
    case "curve_discount": return "curveDiscount";
    case "curve_forward":  return "curveForward";
    case "fixing":         return "fixing";
    case "calibration":    return "calibrationInstrument";
    case "fx_history":     return "RC_*";
    default:               return kind;
  }
}

function requiredFileLabel(filename: string) {
  const lower = filename.toLowerCase();
  if (lower === "curvediscount.xlsx") return "Кривая дисконтирования (curveDiscount.xlsx)";
  if (lower === "curveforward.xlsx") return "Форвардные кривые (curveForward.xlsx)";
  if (lower === "fixing.xlsx") return "Исторические фиксинги (fixing.xlsx)";
  if (lower === "calibrationinstrument.xlsx" || lower === "calibration.xlsx") {
    return "Калибровочные инструменты (calibrationInstrument.xlsx)";
  }
  if (filename.startsWith("RC_") || lower.startsWith("rc_") || lower.includes("fx")) {
    return "История валютных курсов (файлы RC_*)";
  }
  return `Обязательный файл: ${filename}`;
}

export default function MarketDataPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const [localLoading, setLocalLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(true);

  const hasPortfolio = dataState.portfolio.positions.length > 0;
  const positions = dataState.portfolio.positions;
  const summary = dataState.marketDataSummary;

  const applySummary = (nextSummary: MarketDataSessionSummary, note?: string) => {
    dataDispatch({ type: "SET_MARKET_DATA_SUMMARY", summary: nextSummary });
    dataDispatch({ type: "RESET_RESULTS" });
    dispatch({ type: "RESET_DOWNSTREAM", fromStep: WorkflowStep.MarketData });
    const missingFactors = nextSummary.blocking_errors;
    dispatch({ type: "SET_MARKET_STATUS", missingFactors, status: nextSummary.ready ? "ready" : "idle" });
    if (nextSummary.ready) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
    if (note) { setStatusText(note); setStatusOk(true); }
  };

  useEffect(() => {
    if (!summary?.session_id) return;
    let cancelled = false;
    fetchMarketDataSession(summary.session_id)
      .then((fresh) => {
        if (cancelled) return;
        dataDispatch({ type: "SET_MARKET_DATA_SUMMARY", summary: fresh });
        const missingFactors = fresh.blocking_errors;
        dispatch({ type: "SET_MARKET_STATUS", missingFactors, status: fresh.ready ? "ready" : "idle" });
        if (fresh.ready) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [dataDispatch, dispatch, summary?.session_id]);

  const isReady        = summary?.ready ?? false;
  const blockingErrors = summary?.blocking_errors ?? 0;
  const warnings       = summary?.warnings ?? 0;
  const missingRequired = summary?.missing_required_files ?? [
    "curveDiscount.xlsx",
    "curveForward.xlsx",
    "fixing.xlsx",
    "calibrationInstrument.xlsx",
    "RC_*",
  ];
  const fileCount      = summary?.files.length ?? 0;
  const loadedKinds = useMemo(
    () => new Set((summary?.files ?? []).map((file) => file.kind)),
    [summary?.files]
  );
  const instrumentStats = useMemo(() => {
    const option = positions.filter((p) => p.instrument_type === "option").length;
    const forward = positions.filter((p) => p.instrument_type === "forward").length;
    const swapIr = positions.filter((p) => p.instrument_type === "swap_ir").length;
    const currencies = new Set(
      positions
        .flatMap((p) => [p.currency, p.pay_currency, p.receive_currency, p.collateral_currency])
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toUpperCase())
    );

    return { option, forward, swapIr, currencies };
  }, [positions]);

  const marketRequirements = useMemo(() => {
    const hasAny = positions.length > 0;
    const hasOption = instrumentStats.option > 0;
    const hasForward = instrumentStats.forward > 0;
    const hasSwapIr = instrumentStats.swapIr > 0;
    const needsFx =
      instrumentStats.currencies.size > 1 ||
      Array.from(instrumentStats.currencies).some((currency) => currency !== "RUB") ||
      positions.some((p) => p.underlying_symbol?.includes("/"));

    const available = {
      discount: (summary?.counts.discount_curves ?? 0) > 0 || loadedKinds.has("curve_discount"),
      forward: (summary?.counts.forward_curves ?? 0) > 0 || loadedKinds.has("curve_forward"),
      fixing: (summary?.counts.fixings ?? 0) > 0 || loadedKinds.has("fixing"),
      calibration: (summary?.counts.calibration_instruments ?? 0) > 0 || loadedKinds.has("calibration"),
      fx: (summary?.counts.fx_history ?? 0) > 0 || loadedKinds.has("fx_history"),
    };

    return [
      {
        key: "discount",
        label: "Кривые дисконтирования",
        hint: "Нужны для дисконтирования денежных потоков.",
        required: hasAny,
        loaded: available.discount,
      },
      {
        key: "forward",
        label: "Форвардные кривые",
        hint: "Нужны для оценки форвардов и плавающих ставок.",
        required: hasOption || hasForward || hasSwapIr,
        loaded: available.forward,
      },
      {
        key: "fixing",
        label: "Исторические фиксинги",
        hint: "Нужны для инструментов с привязкой к индексам ставок.",
        required: hasSwapIr,
        loaded: available.fixing,
      },
      {
        key: "calibration",
        label: "Калибровочные инструменты",
        hint: "Нужны для волатильности и корректной оценки опционов.",
        required: hasOption,
        loaded: available.calibration,
      },
      {
        key: "fx",
        label: "История FX (RC_*)",
        hint: "Нужна для многовалютного портфеля и валютных базовых активов.",
        required: needsFx,
        loaded: available.fx,
      },
    ];
  }, [instrumentStats.forward, instrumentStats.option, instrumentStats.swapIr, instrumentStats.currencies, loadedKinds, positions, summary?.counts]);

  const requiredMarketItems = useMemo(
    () => marketRequirements.filter((item) => item.required),
    [marketRequirements]
  );
  const allRequiredLoaded = requiredMarketItems.length > 0 && requiredMarketItems.every((item) => item.loaded);
  const missingRequiredHuman = useMemo(
    () => Array.from(new Set(missingRequired.map(requiredFileLabel))),
    [missingRequired]
  );

  const uploadMany = async (files: File[]) => {
    if (!files.length) return;

    setLocalLoading(true);
    setStatusText(null);
    setStatusOk(true);
    dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "loading" });

    const failed: string[] = [];
    let sessionId = summary?.session_id;
    let lastSummary: MarketDataSessionSummary | null = null;

    try {
      for (const file of files) {
        try {
          const next = await uploadMarketDataBundleFile(file, sessionId);
          sessionId = next.session_id;
          lastSummary = next;
        } catch {
          failed.push(file.name);
        }
      }

      if (lastSummary) {
        applySummary(lastSummary);
      } else {
        dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "idle" });
      }

      if (!failed.length) {
        const suffix = files.length === 1 ? "файл" : "файлов";
        setStatusText(`Загружено ${files.length} ${suffix} в bundle.`);
        setStatusOk(true);
      } else if (failed.length < files.length) {
        setStatusText(`Загружено ${files.length - failed.length} из ${files.length}. Не удалось: ${failed.join(", ")}`);
        setStatusOk(false);
      } else {
        setStatusText(`Не удалось загрузить файлы: ${failed.join(", ")}`);
        setStatusOk(false);
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleContinue = () => {
    flushSync(() => { dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData }); });
    nav("/configure");
  };

  const bundleStatusColor = isReady ? "success" : localLoading ? "warning" : blockingErrors > 0 ? "danger" : "default";
  const bundleStatusText  = isReady ? "Bundle готов" : localLoading ? "Загрузка…" : "Bundle не завершён";

  return (
    <div className="importPagePlain">

      {/* ── Hero ── */}
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Рыночные данные</h1>
          <div className="importHeroMeta">
            <Chip color={bundleStatusColor} variant="soft" radius="sm" size="sm">{bundleStatusText}</Chip>
            {fileCount > 0 && <span className="importFileTag">{fileCount} файлов в сессии</span>}
          </div>
        </div>

        <div className="validateHeroRight">
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink"
            disabled={!isReady || !hasPortfolio}
            onClick={handleContinue}
            aria-label="К настройке расчёта"
          >
            <span className="importHeroNextLinkText pageTitle">К настройке расчёта</span>
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>→</span>
          </button>
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink validateHeroBackLink"
            onClick={() => nav("/validate")}
            aria-label="К проверке данных"
          >
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>←</span>
            <span className="importHeroNextLinkText pageTitle">К проверке данных</span>
          </button>
        </div>
      </div>

      {/* ── Upload zone ── */}
      <div className={`importZone${isReady ? " importZone--loaded" : ""}`}>
        <div className="importUploadSplit marketUploadSplit">

          {/* Left: dropzone + datasets button */}
          <div className="marketDropPane">
            <FileDropzone
              accept=".xlsx,.xls"
              disabled={localLoading}
              title={localLoading ? "Обновляем bundle…" : "Перетащите один или несколько файлов"}
              subtitle="Поддерживается массовая загрузка из Datasets"
              multiple
              onFiles={uploadMany}
            />
          </div>

          {/* Middle: API stub */}
          <div className="marketApiStubCol">
            <button type="button" className="marketApiStubButton" disabled aria-disabled="true">
              Включить API
            </button>
            <span className="marketApiStubHint">Скоро будет доступно</span>
          </div>

          {/* Right: bundle status tile */}
          <div className="marketBundleTile">
            <div className="marketBundleTileTop">
              <span className="marketBundleEyebrow">Статус bundle</span>
              {isReady || allRequiredLoaded ? <span className="marketBundleCheck" aria-label="Bundle готов">✓</span> : null}
            </div>

            {!hasPortfolio ? (
              <div className="marketBundleState">
                <div className="marketBundleStateTitle">Сначала загрузите портфель</div>
                <div className="marketBundleStateText">
                  После импорта покажем точный список рыночных данных под ваш состав позиций.
                </div>
              </div>
            ) : requiredMarketItems.length === 0 ? (
              <div className="marketBundleState">
                <div className="marketBundleStateTitle">Для текущего набора нет обязательных файлов</div>
                <div className="marketBundleStateText">Можно перейти дальше или загрузить данные вручную.</div>
              </div>
            ) : (
              <div className="marketBundleState">
                <div className="marketBundleStateTitle">Что нужно для текущего портфеля</div>
                <div className="marketBundleStateText">
                  Определено автоматически: {positions.length} поз. · option {instrumentStats.option} ·
                  forward {instrumentStats.forward} · swap_ir {instrumentStats.swapIr} · валют {instrumentStats.currencies.size}
                </div>
                <ul className="marketBundleRequirementList">
                  {requiredMarketItems.map((item) => (
                    <li
                      key={item.key}
                      className={`marketBundleRequirementItem ${item.loaded ? "is-loaded" : "is-missing"}`}
                    >
                      <span className="marketBundleRequirementMark" aria-hidden>{item.loaded ? "✓" : "•"}</span>
                      <div className="marketBundleRequirementBody">
                        <strong>{item.label}</strong>
                        <span>{item.hint}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!summary || fileCount === 0 ? (
              <div className="marketBundleState marketBundleState--compact">
                <div className="marketBundleStateText">Ожидаемые файлы backend:</div>
                <ul className="marketBundleNeedList">
                  {missingRequiredHuman.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="marketBundleMeta">
              Файлов: {fileCount} · Ошибок: {blockingErrors} · Замечаний: {warnings}
            </div>
          </div>

        </div>

        {/* Status notification */}
        <AnimatePresence>
          {statusText && (
            <motion.div
              className="validateAckZone"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Chip color={statusOk ? "success" : "danger"} variant="soft">
                {statusText}
              </Chip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Body ── */}
      <div className="importBody">
        <div className="importBodyMain">
          {/* Files and log board */}
          <Reveal delay={0.05}>
            <div className="marketBoardGrid">
              <div className="marketBoardCard">
                <div className="marketBoardTitle">Загруженные файлы</div>
                <div className="marketBoardSub">Текущий состав bundle по сессии</div>
                <div className="marketFileList">
                  {summary?.files.length ? (
                    summary.files.map((file) => (
                      <div key={file.filename} className="marketFileRow">
                        <div className="marketFileRowMain">
                          <strong>{file.filename}</strong>
                          <span>{uploadKindLabel(file.kind)} · {(file.size_bytes / 1024).toFixed(1)} KB</span>
                        </div>
                        <span className="marketFileBadge">OK</span>
                      </div>
                    ))
                  ) : (
                    <div className="textMuted">Пока не загружено ни одного файла.</div>
                  )}
                </div>
              </div>

              <div className="marketBoardCard">
                <div className="marketBoardTitle">Проверка и замечания</div>
                <div className="marketBoardSub">Что нужно дозагрузить и что проверить</div>
                <div className="marketIssueList">
                  {missingRequiredHuman.length > 0 && (
                    <div className="marketIssueRow is-warn">
                      <strong>Нужно добавить {missingRequiredHuman.length} файл(ов)</strong>
                      <span>{missingRequiredHuman.slice(0, 3).join(" · ")}</span>
                    </div>
                  )}
                  {summary?.validation_log.length ? (
                    summary.validation_log.slice(0, 6).map((entry, index) => (
                      <div
                        key={`${entry.message}-${index}`}
                        className={`marketIssueRow ${entry.severity === "ERROR" ? "is-error" : "is-info"}`}
                      >
                        <strong>{entry.severity}</strong>
                        <span>{entry.message}</span>
                      </div>
                    ))
                  ) : (
                    <div className="marketIssueRow is-ok">
                      <strong>Замечаний нет</strong>
                      <span>Bundle выглядит корректно.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Reveal>

        </div>
      </div>

    </div>
  );
}
