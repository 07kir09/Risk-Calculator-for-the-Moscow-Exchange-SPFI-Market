import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { demoPositions } from "../mock/demoData";
import { useAppData } from "../state/appDataStore";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import Button from "./Button";

const STORAGE_KEY = "onboarding_seen_v1";

export default function OnboardingModal() {
  const nav = useNavigate();
  const { dispatch: dataDispatch } = useAppData();
  const { dispatch } = useWorkflow();
  const [open, setOpen] = useState(() => localStorage.getItem(STORAGE_KEY) !== "1");
  const portalRoot = useMemo(() => document.getElementById("overlay-root") ?? document.body, []);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) localStorage.setItem(STORAGE_KEY, "1");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={() => setOpen(false)} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Как работать с калькулятором</div>
          <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)} aria-label="Закрыть">
            Закрыть
          </button>
        </div>
        <div className="modal-body">
          <div className="stack">
            <div className="textMuted">
              Сайт ведёт по шагам. Пока шаг не завершён — следующий будет заблокирован (это нормально).
            </div>
            <ol style={{ margin: 0, paddingLeft: 18 }} className="stack">
              <li>
                <strong>Импорт сделок</strong> — загрузите CSV или демо‑портфель.
              </li>
              <li>
                <strong>Проверка данных</strong> — исправьте ошибки формата (критические — обязательно).
              </li>
              <li>
                <strong>Запуск расчёта</strong> — выберите метрики и получите отчёты (Панель / Стрессы / Лимиты).
              </li>
            </ol>
            <div className="textMuted">
              Если вы сомневаетесь, что загрузить — начните с демо‑портфеля, а потом замените файл на свой.
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: "space-between" }}>
          <Button
            variant="secondary"
            onClick={() => {
              dataDispatch({ type: "SET_PORTFOLIO", positions: demoPositions, source: "demo" });
              dataDispatch({ type: "SET_VALIDATION_LOG", log: [] });
              dispatch({ type: "RESET_ALL" });
              dispatch({ type: "SET_SNAPSHOT", snapshotId: crypto.randomUUID() });
              dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Import });
              dispatch({ type: "SET_VALIDATION", criticalErrors: 0, warnings: 0, acknowledged: false });
              setOpen(false);
              nav("/validate");
            }}
          >
            Загрузить демо
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              nav("/import");
            }}
          >
            Начать
          </Button>
        </div>
      </div>
    </div>,
    portalRoot
  );
}

