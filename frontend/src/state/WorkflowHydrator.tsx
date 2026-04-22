import { useEffect } from "react";
import { fetchMarketDataSession } from "../api/endpoints";
import { MarketDataSessionSummary } from "../api/contracts/marketData";
import { useAppData } from "./appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

function sameSummaryMeta(a: MarketDataSessionSummary | null, b: MarketDataSessionSummary) {
  if (!a) return false;
  return (
    a.session_id === b.session_id &&
    a.ready === b.ready &&
    a.blocking_errors === b.blocking_errors &&
    a.warnings === b.warnings &&
    a.files.length === b.files.length &&
    a.missing_required_files.join("|") === b.missing_required_files.join("|")
  );
}

export default function WorkflowHydrator() {
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: workflowState, dispatch } = useWorkflow();

  const positionsCount = dataState.portfolio.positions.length;
  const hasImportAttempt = Boolean(dataState.portfolio.importedAt);
  const criticalErrors = dataState.validationLog.filter((entry) => entry.severity === "ERROR").length;
  const warnings = dataState.validationLog.filter((entry) => entry.severity === "WARNING").length;
  const validationReady = positionsCount > 0 && criticalErrors === 0 && (warnings === 0 || workflowState.validation.acknowledged);
  const marketSummary = dataState.marketDataSummary;
  const marketMode = dataState.marketDataMode ?? "api_auto";
  const apiAutoMode = marketMode === "api_auto";
  const marketReady = Boolean(
    apiAutoMode ||
      (marketSummary &&
        marketSummary.ready &&
        marketSummary.blocking_errors === 0 &&
        marketSummary.missing_required_files.length === 0)
  );

  useEffect(() => {
    if (!hasImportAttempt) return;
    if (!workflowState.snapshotId) {
      dispatch({
        type: "SET_SNAPSHOT",
        snapshotId: dataState.portfolio.importedAt ?? `restored_${positionsCount}`,
      });
    }
    if (!workflowState.completedSteps.includes(WorkflowStep.Import)) {
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Import });
    }
  }, [dataState.portfolio.importedAt, dispatch, hasImportAttempt, positionsCount, workflowState.completedSteps, workflowState.snapshotId]);

  useEffect(() => {
    if (
      workflowState.validation.criticalErrors === criticalErrors &&
      workflowState.validation.warnings === warnings
    ) {
      return;
    }
    dispatch({
      type: "SET_VALIDATION",
      criticalErrors,
      warnings,
      acknowledged: workflowState.validation.acknowledged && criticalErrors === 0,
    });
  }, [
    criticalErrors,
    dispatch,
    warnings,
    workflowState.validation.acknowledged,
    workflowState.validation.criticalErrors,
    workflowState.validation.warnings,
  ]);

  useEffect(() => {
    if (!validationReady || workflowState.completedSteps.includes(WorkflowStep.Validate)) return;
    dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Validate });
  }, [dispatch, validationReady, workflowState.completedSteps]);

  useEffect(() => {
    const nextStatus = marketReady ? "ready" : "idle";
    const nextMissingFactors = apiAutoMode ? 0 : marketSummary?.blocking_errors ?? 0;
    if (
      workflowState.marketData.status !== nextStatus ||
      workflowState.marketData.missingFactors !== nextMissingFactors
    ) {
      dispatch({
        type: "SET_MARKET_STATUS",
        status: nextStatus,
        missingFactors: nextMissingFactors,
      });
    }
    if (
      marketReady &&
      validationReady &&
      !workflowState.completedSteps.includes(WorkflowStep.MarketData)
    ) {
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
    }
  }, [
    dispatch,
    apiAutoMode,
    marketReady,
    marketSummary?.blocking_errors,
    validationReady,
    workflowState.completedSteps,
    workflowState.marketData.missingFactors,
    workflowState.marketData.status,
  ]);

  useEffect(() => {
    if (
      !workflowState.calcConfig.selectedMetrics.length ||
      !validationReady ||
      !marketReady ||
      workflowState.completedSteps.includes(WorkflowStep.Configure)
    ) {
      return;
    }
    dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Configure });
  }, [
    dispatch,
    apiAutoMode,
    marketReady,
    validationReady,
    workflowState.calcConfig.selectedMetrics.length,
    workflowState.completedSteps,
  ]);

  useEffect(() => {
    if (!dataState.results.metrics) return;
    if (!workflowState.completedSteps.includes(WorkflowStep.CalcRun)) {
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.CalcRun });
    }
    if (!workflowState.completedSteps.includes(WorkflowStep.Results)) {
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Results });
    }
  }, [dataState.results.metrics, dispatch, workflowState.completedSteps]);

  useEffect(() => {
    const sessionId = marketSummary?.session_id;
    if (!sessionId) return;

    let cancelled = false;
    fetchMarketDataSession(sessionId)
      .then((fresh) => {
        if (cancelled || sameSummaryMeta(dataState.marketDataSummary, fresh)) return;
        dataDispatch({ type: "SET_MARKET_DATA_SUMMARY", summary: fresh });
      })
      .catch(() => {
        // Temporary API errors should not wipe the local session immediately.
      });

    return () => {
      cancelled = true;
    };
  }, [dataDispatch, dataState.marketDataSummary, marketSummary?.session_id]);

  return null;
}
