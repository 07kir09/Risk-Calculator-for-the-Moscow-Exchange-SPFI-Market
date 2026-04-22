import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { fetchMarketDataSession, loadDefaultMarketDataBundle, uploadMarketDataBundleFile } from "../api/endpoints";
import { MarketDataSessionSummary } from "../api/contracts/marketData";
import Button from "../components/Button";
import FileDropzone from "../components/FileDropzone";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

function requiredFileLabel(filename: string) {
  const lower = filename.toLowerCase();
  if (lower === "curvediscount.xlsx") return "curveDiscount.xlsx";
  if (lower === "curveforward.xlsx") return "curveForward.xlsx";
  if (lower === "fixing.xlsx") return "fixing.xlsx";
  if (lower === "calibrationinstrument.xlsx" || lower === "calibration.xlsx") return "calibrationInstrument*.xlsx";
  if (filename.startsWith("RC_") || lower.startsWith("rc_") || lower.includes("fx")) return "RC_*.xlsx";
  return filename;
}

type ApiRequirement = {
  key: string;
  title: string;
  description: string;
  required: boolean;
};

function buildApiRequirements(instrumentTypes: Set<string>, currencies: Set<string>): ApiRequirement[] {
  const hasOption = instrumentTypes.has("option");
  const hasForward = instrumentTypes.has("forward");
  const hasSwap = instrumentTypes.has("swap_ir");
  const hasNonRubCurrency = Array.from(currencies).some((currency) => currency !== "RUB");

  return [
    {
      key: "quotes",
      title: "Котировки базовых активов",
      description: "Нужны для переоценки позиций по текущему рынку.",
      required: true,
    },
    {
      key: "discount",
      title: "Кривые дисконтирования",
      description: "Нужны для дисконтирования денежных потоков и расчета PV.",
      required: true,
    },
    {
      key: "forward",
      title: "Форвардные кривые и fixings",
      description: "Используются для forward/swap и плавающих компонент.",
      required: hasForward || hasSwap,
    },
    {
      key: "vol",
      title: "Поверхность волатильности",
      description: "Нужна для корректной оценки опционов и веги.",
      required: hasOption,
    },
    {
      key: "fx",
      title: "FX-курсы",
      description: "Используются для приведения мультивалютного портфеля в базовую валюту.",
      required: hasNonRubCurrency,
    },
  ];
}

export default function MarketDataPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const [localLoading, setLocalLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(true);
  const marketDataMode = dataState.marketDataMode ?? "api_auto";
  const apiAutoMode = marketDataMode === "api_auto";

  const hasPortfolio = dataState.portfolio.positions.length > 0;
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

  const loadDefaultBundle = async (successNote: string) => {
    setLocalLoading(true);
    setStatusText(null);
    setStatusOk(true);
    dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "loading" });
    try {
      const nextSummary = await loadDefaultMarketDataBundle();
      applySummary(nextSummary, successNote);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось автоматически загрузить bundle из datasets.";
      setStatusText(message);
      setStatusOk(false);
      dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "idle" });
    } finally {
      setLocalLoading(false);
    }
  };

  const isReady        = summary?.ready ?? false;
  const blockingErrors = summary?.blocking_errors ?? 0;
  const fileCount      = summary?.files.length ?? 0;
  const missingRequired = summary?.missing_required_files ?? ["curveDiscount.xlsx", "curveForward.xlsx", "fixing.xlsx"];
  const missingRequiredHuman = useMemo(
    () => Array.from(new Set(missingRequired.map(requiredFileLabel))),
    [missingRequired]
  );
  const validationIssues = useMemo(
    () =>
      (summary?.validation_log ?? [])
        .filter((entry) => {
          const severity = String(entry.severity ?? "").toUpperCase();
          return severity === "ERROR" || severity === "WARNING";
        })
        .slice(0, 10),
    [summary?.validation_log]
  );

  const portfolioProfile = useMemo(() => {
    const positions = dataState.portfolio.positions;
    const instrumentCounts = new Map<string, number>();
    const currencySet = new Set<string>();
    const underlyingSet = new Set<string>();

    for (const position of positions) {
      const instrument = String(position.instrument_type ?? "").trim() || "unknown";
      instrumentCounts.set(instrument, (instrumentCounts.get(instrument) ?? 0) + 1);
      if (position.currency) currencySet.add(String(position.currency).toUpperCase());
      if (position.underlying_symbol) underlyingSet.add(String(position.underlying_symbol).toUpperCase());
    }

    const instruments = Array.from(instrumentCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([name, count]) => `${name}: ${count}`);

    const currencies = Array.from(currencySet).sort();
    const underlyings = Array.from(underlyingSet).sort().slice(0, 8);
    const apiRequirements = buildApiRequirements(new Set(instrumentCounts.keys()), currencySet);

    return {
      positionsCount: positions.length,
      instruments,
      currencies,
      underlyings,
      apiRequirements,
    };
  }, [dataState.portfolio.positions]);

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
  const bundleStatusText  = apiAutoMode ? "API авто-режим" : isReady ? "Bundle готов" : localLoading ? "Загрузка…" : "Bundle не завершён";
  const canContinue = hasPortfolio && (apiAutoMode || isReady);
  const layoutTransition = { type: "spring" as const, stiffness: 260, damping: 28, mass: 0.7 };

  const switchMarketDataMode = (mode: "api_auto" | "manual_bundle") => {
    dataDispatch({ type: "SET_MARKET_DATA_MODE", mode });
    dataDispatch({ type: "RESET_RESULTS" });
    dispatch({ type: "RESET_DOWNSTREAM", fromStep: WorkflowStep.MarketData });
    setStatusText(null);
    setStatusOk(true);
  };

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
            disabled={!canContinue}
            onClick={handleContinue}
            aria-label="К настройке расчёта"
          >
            <span className="importHeroNextLinkText pageTitle">К настройке расчёта</span>
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>→</span>
          </button>
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink validateHeroBackLink"
            onClick={() => nav("/import")}
            aria-label="К импорту"
          >
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>←</span>
            <span className="importHeroNextLinkText pageTitle">К импорту</span>
          </button>
        </div>
      </div>

      {/* ── Upload zone ── */}
      <div className={`importZone${isReady ? " importZone--loaded" : ""}`}>
        <motion.div
          layout
          transition={layoutTransition}
          className={`importUploadSplit marketUploadSplit ${apiAutoMode ? "is-api-mode" : "is-manual-mode"}`}
        >

          {/* Left: dropzone + datasets button */}
          <AnimatePresence initial={false} mode="popLayout">
            {!apiAutoMode ? (
              <motion.div
                key="market-dropzone"
                layout
                transition={layoutTransition}
                className="marketDropPaneMotion"
                initial={{ opacity: 0, x: -26, scale: 0.985 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 26, scale: 0.985 }}
              >
                <div className="marketDropPane">
                  <FileDropzone
                    accept=".xlsx,.xls"
                    disabled={localLoading}
                    title={localLoading ? "Обновляем bundle…" : "Перетащите один или несколько файлов"}
                    subtitle="Поддерживается массовая загрузка из datasets/Данные для работы"
                    multiple
                    onFiles={uploadMany}
                    showSystemPickerLink={false}
                    extraAction={(
                      <Button
                        type="button"
                        variant="secondary"
                        loading={localLoading}
                        isDisabled={!hasPortfolio}
                        onClick={() => void loadDefaultBundle("Bundle из datasets обновлён.")}
                      >
                        Подтянуть из datasets
                      </Button>
                    )}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Middle: mode switch */}
          <motion.div layout transition={layoutTransition} className="marketApiStubCol">
            <div className="marketApiStubHeader">
              <div className="marketApiStubTitle">Источник рыночных данных</div>
              <div className="marketApiStubSub">
                {apiAutoMode
                  ? "Рекомендуемый режим: backend сам подбирает готовую сессию или делает live sync."
                  : "Ручной режим: загрузите bundle через drag&drop или кнопкой datasets внутри блока."}
              </div>
            </div>
            <div className="marketModeSwitch" role="tablist" aria-label="Режим market data">
              <button
                type="button"
                role="tab"
                aria-selected={apiAutoMode}
                className={`marketModeButton ${apiAutoMode ? "is-active" : ""}`}
                onClick={() => switchMarketDataMode("api_auto")}
              >
                API (авто)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!apiAutoMode}
                className={`marketModeButton ${!apiAutoMode ? "is-active" : ""}`}
                onClick={() => switchMarketDataMode("manual_bundle")}
              >
                Ручной bundle
              </button>
            </div>
            <span className="marketApiStubHint">
              {!hasPortfolio
                ? "Сначала загрузите портфель"
                : apiAutoMode
                  ? "В API-режиме ничего загружать вручную не нужно"
                  : "В ручном режиме сначала загрузите bundle, затем переходите к настройке расчёта"}
            </span>
          </motion.div>

        </motion.div>

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

      <div className="importBody">
        <div className="importBodyMain">
          {apiAutoMode ? (
            <div className="marketBoardGrid">
              <div className="marketBoardCard">
                <div className="marketBoardTitle">Что используется в API-режиме</div>
                <div className="marketBoardSub">Состав рыночных данных, необходимых для текущего портфеля.</div>
                <ul className="marketBundleRequirementList marketBundleRequirementList--board">
                  {portfolioProfile.apiRequirements.map((requirement) => (
                    <li
                      key={requirement.key}
                      className={`marketBundleRequirementItem ${requirement.required ? "is-loaded" : ""}`}
                    >
                      <span className="marketBundleRequirementMark">{requirement.required ? "✓" : "•"}</span>
                      <div className="marketBundleRequirementBody">
                        <strong>{requirement.title}</strong>
                        <span>{requirement.description}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="marketBoardMeta">
                  Данные подтягиваются автоматически при расчете через backend API-провайдеры.
                </div>
              </div>

              <div className="marketBoardCard">
                <div className="marketBoardTitle">Профиль портфеля для market data</div>
                <div className="marketBoardSub">По этому профилю формируется запрос данных в API-режиме.</div>
                <div className="marketIssueList">
                  <div className="marketIssueRow is-info">
                    <strong>Позиции</strong>
                    <span>{portfolioProfile.positionsCount}</span>
                  </div>
                  <div className="marketIssueRow is-info">
                    <strong>Инструменты</strong>
                    <span>{portfolioProfile.instruments.length ? portfolioProfile.instruments.join(" · ") : "—"}</span>
                  </div>
                  <div className="marketIssueRow is-info">
                    <strong>Валюты</strong>
                    <span>{portfolioProfile.currencies.length ? portfolioProfile.currencies.join(", ") : "RUB"}</span>
                  </div>
                  <div className="marketIssueRow is-info">
                    <strong>Базовые активы</strong>
                    <span>{portfolioProfile.underlyings.length ? portfolioProfile.underlyings.join(", ") : "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="marketBoardGrid">
              <div className="marketBoardCard">
                <div className="marketBoardTitle">Нужно дозагрузить</div>
                <div className="marketBoardSub">Обязательные файлы для готового bundle</div>
                {missingRequiredHuman.length > 0 ? (
                  <ul className="marketBundleNeedList">
                    {missingRequiredHuman.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="marketIssueRow is-ok">
                    <strong>Все обязательные файлы загружены</strong>
                    <span>Можно переходить к настройке расчёта.</span>
                  </div>
                )}
              </div>

              <div className="marketBoardCard">
                <div className="marketBoardTitle">Ошибки и замечания</div>
                <div className="marketBoardSub">Проблемы валидации текущего bundle</div>
                <div className="marketIssueList">
                  {validationIssues.length > 0 ? (
                    validationIssues.map((entry, index) => {
                      const severity = String(entry.severity ?? "").toUpperCase();
                      const rowClass = severity === "ERROR" ? "is-error" : "is-warn";
                      return (
                        <div key={`${entry.message}-${index}`} className={`marketIssueRow ${rowClass}`}>
                          <strong>{severity}</strong>
                          <span>{entry.message}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="marketIssueRow is-ok">
                      <strong>Ошибок нет</strong>
                      <span>Валидация не содержит ERROR/WARNING.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
