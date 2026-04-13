import { ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Dropdown } from "@heroui/react";
import ConfirmDialog from "../components/ConfirmDialog";
import NavigationDrawer from "./NavigationDrawer";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { utilityItems, workflowItems } from "./navigationModel";

export default function Topbar({
  title,
}: {
  title: string;
}) {
  const nav = useNavigate();
  const { state, dispatch } = useWorkflow();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const [confirm, setConfirm] = useState<{
    title: string;
    description: ReactNode;
    confirmText?: string;
    danger?: boolean;
    action: () => void;
  } | null>(null);

  const resetSession = () =>
    setConfirm({
      title: "Сбросить текущую сессию?",
      description: (
        <div className="stack">
          <div>Будут очищены загруженные данные, настройки и результаты расчёта.</div>
          <div className="textMuted">Исходные файлы на диске не изменяются.</div>
        </div>
      ),
      confirmText: "Сбросить",
      danger: true,
      action: () => {
        dataDispatch({ type: "RESET_ALL" });
        dispatch({ type: "RESET_ALL" });
        nav("/import", { replace: true });
      },
    });

  return (
    <header className="appTopbar appTopbar--centered" aria-label="Верхняя панель">
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

      <div className="topbarMenuSlot">
        <NavigationDrawer />
        <div className="topbarPageContext" aria-label={`Текущий раздел: ${title}`}>
          <div className="topbarPageEyebrow">Раздел</div>
          <div className="topbarPageTitle">{title}</div>
        </div>
        <nav className="srOnly" aria-label="Быстрые ссылки">
          {[...workflowItems, ...utilityItems].map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="topbarCenter">
        <Dropdown>
          <Dropdown.Trigger
            aria-label="Открыть меню сессии"
            variant="light"
            radius="none"
            className="topbarCenterTrigger"
          >
            <div className="topbarBrand topbarBrand--centered">
              <div className="topbarBrandTitle">Risk Calculator</div>
              <div className="topbarBrandSubtitle">Контур расчёта</div>
            </div>
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom">
            <Dropdown.Menu
              aria-label="Действия сессии"
              onAction={(key) => {
                if (key === "reset") resetSession();
                if (key === "portfolio") nav("/portfolio");
                if (key === "help") nav("/help");
                if (key === "import") nav("/import");
              }}
            >
              <Dropdown.Item id="import">Импорт</Dropdown.Item>
              <Dropdown.Item id="portfolio">Портфель</Dropdown.Item>
              <Dropdown.Item id="help">Справка</Dropdown.Item>
              <Dropdown.Item id="reset" className="text-danger" color="danger">
                Новая сессия
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      <div className="topbarRightSpacer" aria-hidden />
    </header>
  );
}
