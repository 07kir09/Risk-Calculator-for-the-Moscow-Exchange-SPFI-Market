import { useMemo } from "react";
import { useCalculateMutation } from "../../shared/api/hooks";
import { useRiskStore } from "../../app/store/useRiskStore";
import {
  hasCriticalClientErrors,
  validatePosition,
  validateScenario,
  validateScenarioProbabilityMode,
} from "../../shared/lib/validation";
import { FieldIssue } from "../../shared/lib/validation";
import { useShallow } from "zustand/react/shallow";

function convertIssues(issues: FieldIssue[]): FieldIssue[] {
  return issues;
}

export function CalculateButton() {
  const {
    positionsDraft,
    scenariosDraft,
    limitsDraft,
    runConfigDraft,
    isCalculating,
    setCalculationResult,
    setRequestMeta,
    setClientValidationErrors,
    setRequestValidationErrors,
    setLastError,
    startCalculation,
    finishCalculationError,
  } = useRiskStore(
    useShallow((state) => ({
      positionsDraft: state.positionsDraft,
      scenariosDraft: state.scenariosDraft,
      limitsDraft: state.limitsDraft,
      runConfigDraft: state.runConfigDraft,
      isCalculating: state.isCalculating,
      setCalculationResult: state.setCalculationResult,
      setRequestMeta: state.setRequestMeta,
      setClientValidationErrors: state.setClientValidationErrors,
      setRequestValidationErrors: state.setRequestValidationErrors,
      setLastError: state.setLastError,
      startCalculation: state.startCalculation,
      finishCalculationError: state.finishCalculationError,
    }))
  );

  const mutation = useCalculateMutation();

  const preflightIssues = useMemo(
    () => [
      ...positionsDraft.flatMap((position, index) => validatePosition(position, index)),
      ...scenariosDraft.flatMap((scenario, index) => validateScenario(scenario, index)),
      ...validateScenarioProbabilityMode(scenariosDraft),
    ],
    [positionsDraft, scenariosDraft]
  );

  const disabledReason = useMemo(() => {
    if (!positionsDraft.length) return "Нет позиций";
    if (hasCriticalClientErrors(preflightIssues)) return "Сначала исправьте ошибки валидации";
    return null;
  }, [positionsDraft.length, preflightIssues]);

  async function run() {
    const positionIssues = positionsDraft.flatMap((position, index) => validatePosition(position, index));
    const scenarioIssues = scenariosDraft.flatMap((scenario, index) => validateScenario(scenario, index));
    const probabilityIssues = validateScenarioProbabilityMode(scenariosDraft);
    const allClientIssues = [...positionIssues, ...scenarioIssues, ...probabilityIssues];

    setClientValidationErrors(convertIssues(allClientIssues));
    setRequestValidationErrors([]);
    setLastError(null);

    if (allClientIssues.length) {
      return;
    }

    startCalculation();

    try {
      const response = await mutation.mutateAsync({
        positions: positionsDraft,
        scenarios: scenariosDraft,
        limits: limitsDraft,
        ...runConfigDraft,
      });
      setCalculationResult(response.data, response.meta);
      setRequestMeta(response.meta);
    } catch (error: any) {
      setLastError(error);
      const requestIssues = (error?.validationIssues ?? []).map((entry: any) => ({
        field: entry.field ?? "unknown",
        message: entry.message ?? "Ошибка валидации",
        rowIndex: entry.index,
      }));
      setRequestValidationErrors(requestIssues);
      finishCalculationError(error, {
        requestId: error?.requestId,
        traceId: error?.traceId,
        statusCode: error?.status,
      });
    }
  }

  return (
    <button
      className="btn btn-primary"
      disabled={Boolean(disabledReason) || isCalculating}
      onClick={run}
      title={disabledReason ?? undefined}
    >
      {isCalculating ? "Расчёт..." : "Рассчитать"}
    </button>
  );
}
