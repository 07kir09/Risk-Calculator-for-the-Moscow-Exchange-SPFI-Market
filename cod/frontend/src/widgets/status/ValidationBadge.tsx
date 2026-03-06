import { useMemo } from "react";
import { useRiskStore } from "../../app/store/useRiskStore";
import { ValidationMessage } from "../../shared/types/contracts";

const EMPTY_VALIDATION_LOG: ValidationMessage[] = [];

export function ValidationBadge() {
  const calculationResult = useRiskStore((state) => state.calculationResult);
  const validationLog = calculationResult?.validation_log ?? EMPTY_VALIDATION_LOG;
  const warningCount = useMemo(
    () => validationLog.filter((entry) => entry.severity === "WARNING" || entry.severity === "ERROR").length,
    [validationLog]
  );

  if (warningCount === 0) {
    return (
      <span className="badge" tabIndex={0} title="В журнале валидации нет предупреждений">
        Без предупреждений
      </span>
    );
  }

  return (
    <span className="badge badge-warning" tabIndex={0} title={`Предупреждений валидации: ${warningCount}`}>
      Предупреждения: {warningCount}
    </span>
  );
}
