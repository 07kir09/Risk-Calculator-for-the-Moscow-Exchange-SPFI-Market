import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";

function MenuIcon() {
  return (
    <svg className="navItemIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z" />
    </svg>
  );
}

export default function Topbar({
  title,
  onToggleNavigation,
}: {
  title: string;
  onToggleNavigation: () => void;
}) {
  const nav = useNavigate();
  const { state, dispatch } = useWorkflow();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    description: ReactNode;
    confirmText?: string;
    danger?: boolean;
    action: () => void;
  } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <header className="appTopbar" aria-label="Верхняя панель">
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? null}
        confirmText={confirm?.confirmText ?? "Продолжить"}
        danger={confirm?.danger ?? false}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.action();
          setConfirm(null);
        }}
      />
      <div className="topbarLeft">
        <button className="btn btn-secondary topbarNavButton" onClick={onToggleNavigation} aria-label="Управление навигацией">
          <MenuIcon /> Меню
        </button>
        <div className="topbarContext">
          <div className="topbarEyebrow">Risk Calculator SPFI</div>
          <div className="topbarTitle">{title}</div>
        </div>
      </div>

      <div className="topbarActions">
        {(dataState.portfolio.positions.length > 0 || Boolean(dataState.results.metrics) || Boolean(state.snapshotId)) && (
          <Button
            variant="secondary"
            className="topbarResetBtn"
            onClick={() =>
              setConfirm({
                title: "Начать заново?",
                description: (
                  <div className="stack">
                    <div>Мы очистим портфель, сценарии, логи и результаты — и вернём вас на шаг 1.</div>
                    <div className="textMuted">Это не влияет на исходные файлы CSV — только на данные внутри приложения.</div>
                  </div>
                ),
                confirmText: "Очистить и начать заново",
                danger: true,
                action: () => {
                  dataDispatch({ type: "RESET_ALL" });
                  dispatch({ type: "RESET_ALL" });
                  nav("/import", { replace: true });
                },
              })
            }
          >
            Начать заново
          </Button>
        )}
        <button
          className="btn btn-ghost topbarThemeToggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label="Переключить тему"
          title="Переключить тему"
        >
          {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        </button>
      </div>
    </header>
  );
}
