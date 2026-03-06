import { useRiskStore } from "../../app/store/useRiskStore";

export function HealthIndicator() {
  const connected = useRiskStore((state) => state.connected);
  const lastHealthCheckAt = useRiskStore((state) => state.lastHealthCheckAt);

  return (
    <div
      title={lastHealthCheckAt ? new Date(lastHealthCheckAt).toLocaleString() : "Проверок соединения ещё не было"}
      tabIndex={0}
      aria-label="индикатор-соединения"
    >
      <span className={`badge ${connected ? "badge-green" : "badge-red"}`}>{connected ? "Подключено" : "Нет соединения"}</span>
    </div>
  );
}
