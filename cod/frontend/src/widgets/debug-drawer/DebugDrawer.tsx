import { useMemo } from "react";
import { useRiskStore } from "../../app/store/useRiskStore";
import { useShallow } from "zustand/react/shallow";

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }
}

export function DebugDrawer() {
  const show = useRiskStore((state) => state.showDebugDrawer);
  const setShow = useRiskStore((state) => state.setShowDebugDrawer);
  const state = useRiskStore(
    useShallow((store) => ({
      positionsDraft: store.positionsDraft,
      scenariosDraft: store.scenariosDraft,
      limitsDraft: store.limitsDraft,
      runConfigDraft: store.runConfigDraft,
      result: store.calculationResult,
      requestMeta: store.requestMeta,
      error: store.lastError,
    }))
  );

  const payloadPreview = useMemo(
    () =>
      JSON.stringify(
        {
          positions: state.positionsDraft,
          scenarios: state.scenariosDraft,
          limits: state.limitsDraft,
          ...state.runConfigDraft,
        },
        null,
        2
      ),
    [state]
  );

  const responsePreview = useMemo(() => JSON.stringify(state.result ?? state.error ?? {}, null, 2), [state]);

  if (!show) return null;

  return (
    <aside className="drawer drawer-wide">
      <div className="drawer-header">
        <h3 className="section-title">Панель отладки</h3>
        <button className="btn" onClick={() => setShow(false)}>Закрыть</button>
      </div>

      <div className="drawer-content stack-12">
        <div className="panel panel-padded-10 stack-4">
          <h4 className="section-title">Технические метаданные</h4>
          <div className="small-muted">ID запроса: {state.requestMeta?.requestId ?? state.error?.requestId ?? "-"}</div>
          <div className="small-muted">ID трассировки: {state.requestMeta?.traceId ?? state.error?.traceId ?? "-"}</div>
          <div className="small-muted">статус: {state.requestMeta?.statusCode ?? state.error?.status ?? "-"}</div>
          <div className="small-muted">время ответа: {state.requestMeta?.responseMs ?? "-"} мс</div>
        </div>

        <div className="panel panel-padded-10">
          <div className="flex-row align-center justify-between gap-8">
            <h4 className="section-title">Сырой JSON запроса</h4>
            <button className="btn" onClick={() => copyText(payloadPreview)}>Копировать</button>
          </div>
          <pre>{payloadPreview}</pre>
        </div>

        <div className="panel panel-padded-10">
          <div className="flex-row align-center justify-between gap-8">
            <h4 className="section-title">Сырой JSON ответа</h4>
            <button className="btn" onClick={() => copyText(responsePreview)}>Копировать</button>
          </div>
          <pre>{responsePreview}</pre>
        </div>
      </div>
    </aside>
  );
}
