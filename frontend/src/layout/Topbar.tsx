import { ReactNode, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Avatar,
  Badge,
  BreadcrumbItem,
  Breadcrumbs,
  Button as HeroButton,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from "@heroui/react";
import ConfirmDialog from "../components/ConfirmDialog";
import Button from "../components/Button";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";

function PanelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 4h16v3H4Zm0 6h16v3H4Zm0 6h16v3H4Z" />
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
  const location = useLocation();
  const { state, dispatch } = useWorkflow();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const [confirm, setConfirm] = useState<{
    title: string;
    description: ReactNode;
    confirmText?: string;
    danger?: boolean;
    action: () => void;
  } | null>(null);

  const hasState =
    dataState.portfolio.positions.length > 0 || Boolean(dataState.results.metrics) || Boolean(state.snapshotId);

  const status = useMemo(() => {
    if (state.validation.criticalErrors > 0) return { text: "Есть ошибки входа", color: "danger" as const };
    if (state.calcRun.status === "success") return { text: "Результаты актуальны", color: "success" as const };
    if (dataState.portfolio.positions.length > 0) return { text: "Сессия собрана", color: "warning" as const };
    return { text: "Новая сессия", color: "default" as const };
  }, [dataState.portfolio.positions.length, state.calcRun.status, state.validation.criticalErrors]);

  const breadcrumbs = useMemo(() => {
    const root = [{ label: "Контур расчёта", path: "/import" }];
    if (location.pathname === "/import") return root;
    return [...root, { label: title, path: location.pathname }];
  }, [location.pathname, title]);

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
        <HeroButton
          isIconOnly
          variant="light"
          radius="full"
          className="topbarGhostButton"
          onPress={onToggleNavigation}
          aria-label="Открыть навигацию"
        >
          <PanelIcon />
        </HeroButton>
        <div className="topbarBrand">
          <div className="topbarBrandTitle">Risk Calculator</div>
          <Breadcrumbs size="sm" className="topbarBreadcrumbs" itemClasses={{ separator: "topbarBreadcrumbSeparator" }}>
            {breadcrumbs.map((crumb) => (
              <BreadcrumbItem key={crumb.path} onPress={() => nav(crumb.path)} className="topbarBreadcrumbItem">
                {crumb.label}
              </BreadcrumbItem>
            ))}
          </Breadcrumbs>
        </div>
      </div>

      <div className="topbarMeta">
        <div className="topbarCounter">
          <span>Позиции</span>
          <strong>{dataState.portfolio.positions.length.toLocaleString("ru-RU")}</strong>
        </div>
        <Chip color={status.color} variant="flat" radius="sm" className="topbarStatusChip">
          {status.text}
        </Chip>
        {hasState ? (
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <div className="topbarProfile">
                <Badge color={status.color} content="" shape="circle" placement="bottom-right">
                  <Avatar name="RK" className="topbarAvatar" />
                </Badge>
              </div>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Действия сессии"
              onAction={(key) => {
                if (key === "reset") resetSession();
                if (key === "portfolio") nav("/portfolio");
                if (key === "help") nav("/help");
              }}
            >
              <DropdownItem key="portfolio">Портфель</DropdownItem>
              <DropdownItem key="help">Справка</DropdownItem>
              <DropdownItem key="reset" className="text-danger" color="danger">
                Новая сессия
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        ) : (
          <Button variant="shadow" onClick={() => nav("/import")}>
            Начать расчёт
          </Button>
        )}
      </div>
    </header>
  );
}
