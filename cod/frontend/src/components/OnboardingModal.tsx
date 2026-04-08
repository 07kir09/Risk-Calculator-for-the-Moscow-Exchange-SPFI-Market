import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { demoPositions } from "../mock/demoData";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import Button from "./Button";

const STORAGE_KEY = "onboarding_seen_v1";

export default function OnboardingModal() {
  const nav = useNavigate();
  const { dispatch: dataDispatch } = useAppData();
  const { dispatch } = useWorkflow();
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) !== "1";
  });
  const portalRoot = useMemo(() => document.getElementById("overlay-root") ?? document.body, []);

  const closeHint = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) localStorage.setItem(STORAGE_KEY, "1");
  }, [open]);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        setOpen(false);
      }, 15000);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <aside className="onboardingHint" role="dialog" aria-live="polite" aria-label="Подсказка по работе с калькулятором">
      <div className="onboardingHintHeader">
        <div className="onboardingHintTitle">Быстрый старт</div>
        <Button variant="ghost" type="button" onClick={closeHint} aria-label="Скрыть подсказку">
          Закрыть
        </Button>
      </div>
      <div className="onboardingHintBody">
        <div className="textMuted">
          Можешь сразу загружать свой CSV/XLSX. Подсказка больше не блокирует экран.
        </div>
        <ol className="orderedList">
          <li>Импортируй файл или возьми демо-портфель.</li>
          <li>Проверь ошибки и предупреждения.</li>
          <li>Запусти расчёт и открой панель риска.</li>
        </ol>
      </div>
      <div className="onboardingHintFooter">
        <Button
          variant="flat"
          onClick={() => {
            closeHint();
            nav("/import");
          }}
        >
          Начать с файла
        </Button>
        <div className="inlineActions">
          <Button
            variant="secondary"
            onClick={() => {
              dataDispatch({ type: "SET_PORTFOLIO", positions: demoPositions, source: "demo" });
              dataDispatch({ type: "SET_VALIDATION_LOG", log: [] });
              dispatch({ type: "RESET_ALL" });
              dispatch({ type: "SET_SNAPSHOT", snapshotId: crypto.randomUUID() });
              dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Import });
              dispatch({ type: "SET_VALIDATION", criticalErrors: 0, warnings: 0, acknowledged: false });
              closeHint();
              nav("/validate");
            }}
          >
            Загрузить демо
          </Button>
          <Button onClick={closeHint}>
            Понятно
          </Button>
        </div>
      </div>
    </aside>,
    portalRoot
  );
}
