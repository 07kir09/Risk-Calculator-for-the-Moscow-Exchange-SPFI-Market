import { useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ScrollShadow, Tooltip } from "@heroui/react";
import Button from "../components/Button";
import { useAppData } from "../state/appDataStore";
import { isStepAvailable, useWorkflow } from "../workflow/workflowStore";
import { orderedSteps } from "../workflow/order";
import { stepTitle } from "../workflow/labels";
import { WorkflowStep } from "../workflow/workflowTypes";
import { NavItem, utilityItems, workflowItems } from "./navigationModel";
import { showBlockedNavigationToast } from "../lib/blockedNavigationToast";

function DotIcon() {
  return (
    <svg className="navItemIcon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="navItemIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z" />
    </svg>
  );
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { state, dispatch } = useWorkflow();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const nav = useNavigate();

  const firstIncomplete = useMemo(() => {
    for (const step of orderedSteps) {
      if (step === WorkflowStep.Margin && !state.calcConfig.marginEnabled) continue;
      if (!state.completedSteps.includes(step)) return step;
    }
    return WorkflowStep.Results;
  }, [state.calcConfig.marginEnabled, state.completedSteps]);

  const status = useMemo(() => {
    if (state.validation.criticalErrors > 0) return "Есть ошибки";
    if (state.calcRun.status === "success") return "Результаты готовы";
    if (dataState.portfolio.positions.length > 0) return "Сессия собрана";
    return "Новый расчёт";
  }, [dataState.portfolio.positions.length, state.calcRun.status, state.validation.criticalErrors]);

  const handleStartNewCalculation = () => {
    dataDispatch({ type: "RESET_ALL" });
    dispatch({ type: "RESET_ALL" });
    onCloseMobile();
    nav("/import", { replace: true });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const renderItem = (item: NavItem) => {
    const available = item.step ? isStepAvailable(state, item.step) : true;

    if (!available) {
      const reason = `Чтобы открыть «${item.label}», сначала завершите: ${stepTitle[firstIncomplete]}`;
      return (
        <button
          key={item.to}
          type="button"
          className="navItem navItem--locked"
          aria-label={item.label}
          onClick={() => {
            showBlockedNavigationToast(reason);
          }}
        >
          <LockIcon />
          {!collapsed && <span className="navItemLabel">{item.label}</span>}
        </button>
      );
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        aria-label={item.label}
        onClick={onCloseMobile}
        className={({ isActive }) => `navItem ${isActive ? "navItem--active" : ""}`}
      >
        <DotIcon />
        {!collapsed && <span className="navItemLabel">{item.label}</span>}
      </NavLink>
    );
  };

  return (
    <aside
      className={`appSidebar ${collapsed ? "appSidebar--collapsed" : ""} ${mobileOpen ? "appSidebar--mobileOpen" : ""}`}
      aria-label="Навигация"
    >
      <div className={`appSidebarHeader ${collapsed ? "appSidebarHeader--collapsed" : ""}`}>
        <div className="brand" title="Risk Calculator">
          {!collapsed && (
            <div className="brandText">
              <div className="brandTitle">Панель расчёта риска</div>
              <div className="brandSubtitle">{status}</div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="appSidebarMobileClose"
          onClick={onCloseMobile}
          aria-label="Закрыть навигацию"
        >
          ×
        </button>
      </div>

      <ScrollShadow className="appSidebarScroll" hideScrollBar>
        <div className="navGroupLabel">Процесс</div>
        {workflowItems.map((item) =>
          collapsed ? (
            <Tooltip key={item.to} content={item.label} placement="right" delay={200}>
              <div>{renderItem(item)}</div>
            </Tooltip>
          ) : (
            renderItem(item)
          )
        )}

        <div className="navGroupLabel">Дополнительно</div>
        {utilityItems.map((item) =>
          collapsed ? (
            <Tooltip key={item.to} content={item.label} placement="right" delay={200}>
              <div>{renderItem(item)}</div>
            </Tooltip>
          ) : (
            renderItem(item)
          )
        )}
      </ScrollShadow>

      {!collapsed && (
        <div className="sidebarFooter">
          <Button variant="secondary" className="sidebarAction" onClick={handleStartNewCalculation}>
            К новому расчёту
          </Button>
        </div>
      )}
    </aside>
  );
}
