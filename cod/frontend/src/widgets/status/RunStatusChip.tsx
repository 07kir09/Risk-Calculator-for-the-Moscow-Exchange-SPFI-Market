import { useRiskStore } from "../../app/store/useRiskStore";

function classNameByStatus(status: string): string {
  if (status === "Updated just now" || status === "Ready to calculate") return "badge badge-green";
  if (status === "Error" || status === "Outdated") return "badge badge-red";
  if (status === "Calculating") return "badge badge-warning";
  return "badge";
}

function labelByStatus(status: string): string {
  if (status === "Updated just now") return "Обновлено";
  if (status === "Ready to calculate") return "Готово к расчёту";
  if (status === "Calculating") return "Идёт расчёт";
  if (status === "Error") return "Ошибка";
  if (status === "Outdated") return "Устарело";
  if (status === "Draft") return "Черновик";
  return status;
}

export function RunStatusChip() {
  const runStatus = useRiskStore((state) => state.runStatus);
  const label = labelByStatus(runStatus);
  return (
    <span className={classNameByStatus(runStatus)} tabIndex={0} title={`Статус расчёта: ${label}`}>
      {label}
    </span>
  );
}
