import { ReactNode, useEffect, useMemo, useState } from "react";
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

function formatId(id?: string) {
  if (!id) return "—";
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export default function Topbar({
  title,
  onOpenMobileMenu,
  onToggleCollapsed,
}: {
  title: string;
  onOpenMobileMenu: () => void;
  onToggleCollapsed: () => void;
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

  const calcBadge = useMemo(() => {
    switch (state.calcRun.status) {
      case "running":
        return <span className="badge warn">Считаем…</span>;
      case "success":
        return <span className="badge ok">Готово</span>;
      case "error":
        return <span className="badge danger">Ошибка</span>;
      default:
        return <span className="badge">Не запускали</span>;
    }
  }, [state.calcRun.status]);

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
        <button className="btn btn-secondary" onClick={onOpenMobileMenu} aria-label="Открыть меню">
          <MenuIcon /> Меню
        </button>
        <button className="btn btn-ghost" onClick={onToggleCollapsed} aria-label="Свернуть сайдбар">
          Свернуть
        </button>
        <div className="topbarTitle">{title}</div>
      </div>

      <div className="topbarMeta">
        <span className="code topbarCode">snapshot: {formatId(state.snapshotId)}</span>
        <span className="code topbarCode">run: {formatId(state.calcRun.calcRunId)}</span>
        {calcBadge}
        {(dataState.portfolio.positions.length > 0 || Boolean(dataState.results.metrics) || Boolean(state.snapshotId)) && (
          <Button
            variant="secondary"
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
          className="btn btn-secondary"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label="Переключить тему"
          title="Переключить тему"
        >
          {theme === "dark" ? "Светлая" : "Тёмная"}
        </button>
      </div>
    </header>
  );
}
