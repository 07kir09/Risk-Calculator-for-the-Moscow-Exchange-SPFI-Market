import { useRiskStore } from "../../app/store/useRiskStore";

export function RequestMetaPanel() {
  const requestMeta = useRiskStore((state) => state.requestMeta);
  const error = useRiskStore((state) => state.lastError);

  if (!requestMeta && !error) {
    return null;
  }

  const requestId = error?.requestId ?? requestMeta?.requestId;
  const traceId = error?.traceId ?? requestMeta?.traceId;

  return (
    <div className="panel panel-padded-10 stack-6">
      <h3 className="section-title">Метаданные запроса</h3>
      <div className="small-muted">ID запроса: {requestId ?? "-"}</div>
      <div className="small-muted">ID трассировки: {traceId ?? "-"}</div>
      <div className="small-muted">статус: {requestMeta?.statusCode ?? error?.status ?? "-"}</div>
      <div className="small-muted">время ответа: {requestMeta?.responseMs ?? "-"} мс</div>
    </div>
  );
}
