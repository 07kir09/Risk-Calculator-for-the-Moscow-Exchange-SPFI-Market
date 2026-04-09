import type { SVGProps } from "react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Drawer } from "@heroui/react";
import { useAppData } from "../state/appDataStore";
import { orderedSteps } from "../workflow/order";
import { stepTitle } from "../workflow/labels";
import { isStepAvailable, useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { utilityItems, workflowItems } from "./navigationModel";
import { showBlockedNavigationToast } from "../lib/blockedNavigationToast";

function SvgIcon({ d, ...props }: SVGProps<SVGSVGElement> & { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d={d} />
    </svg>
  );
}

const ICON_PATH: Record<string, string> = {
  "/import":    "M12 16 7 11 8.4 9.55l2.6 2.6V4h2v8.15l2.6-2.6L17 11Zm-6 4q-.825 0-1.413-.588T4 18v-3h2v3h12v-3h2v3q0 .825-.587 1.413T18 20Z",
  "/validate":  "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41Z",
  "/market":    "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
  "/configure": "M3 17v-2h4.5v-1.75H3V9.5h7v-1.75H3V6h16v1.75h-7V9.5h8v3.75h-8V15h4.5v2z",
  "/run":       "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z",
  "/dashboard": "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  "/stress":    "M7 2v11h3v9l7-12h-4l4-8z",
  "/limits":    "M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5z",
  "/margin":    "M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5a2 2 0 0 1 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
  "/export":    "M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z",
  "/actions":   "M9 3 8 6 5 7l3 1 1 3 1-3 3-1-3-1-1-3zm3 6-1.5 3.5L7 14l3.5 1.5L12 19l1.5-3.5L17 14l-3.5-1.5zm5-6-.9 2.1-2.1.9 2.1.9.9 2.1.9-2.1 2.1-.9-2.1-.9-.9-2.1z",
  "/portfolio": "M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z",
  "/help":      "M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z",
};

const CHECK_D = "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
const MENU_D  = "M4 4h16v3H4Zm0 6h16v3H4Zm0 6h16v3H4Z";

export default function NavigationDrawer() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const { state } = useWorkflow();
  const { state: dataState } = useAppData();

  const firstIncomplete = useMemo(() => {
    for (const step of orderedSteps) {
      if (step === WorkflowStep.Margin && !state.calcConfig.marginEnabled) continue;
      if (!state.completedSteps.includes(step)) return step;
    }
    return WorkflowStep.Results;
  }, [state.calcConfig.marginEnabled, state.completedSteps]);

  const statusLabel = useMemo(() => {
    if (state.validation.criticalErrors > 0) return "Есть ошибки входа";
    if (state.calcRun.status === "success") return "Результаты актуальны";
    if (dataState.portfolio.positions.length > 0) return "Сессия собрана";
    return "Новая сессия";
  }, [dataState.portfolio.positions.length, state.calcRun.status, state.validation.criticalErrors]);

  const completedCount = state.completedSteps.length;
  const totalWorkflow = workflowItems.filter((i) => i.step).length;
  const progressPct = Math.round((completedCount / Math.max(totalWorkflow, 1)) * 100);

  const renderItem = (to: string, label: string, step?: WorkflowStep, index?: number) => {
    const available = step ? isStepAvailable(state, step) : true;
    const completed = step ? state.completedSteps.includes(step) : false;
    const active = available && location.pathname === to;
    const reason = available ? "" : `Завершите: ${stepTitle[firstIncomplete]}`;
    const iconD = ICON_PATH[to] ?? ICON_PATH["/dashboard"];

    return (
      <button
        key={to}
        type="button"
        className={[
          "navigationDrawerItem",
          active     ? "navigationDrawerItem--active"    : "",
          completed && !active ? "navigationDrawerItem--completed" : "",
          !available ? "navigationDrawerItem--locked"   : "",
        ].filter(Boolean).join(" ")}
        onClick={() => {
          if (!available) {
            showBlockedNavigationToast(reason);
            return;
          }
          setOpen(false);
          nav(to);
        }}
      >
        <span className="navigationDrawerItemIcon">
          <SvgIcon d={iconD} width={18} height={18} />
        </span>
        <span className="navigationDrawerItemContent">
          <span className="navigationDrawerItemLabel">{label}</span>
          {reason ? <span className="navigationDrawerItemHint">{reason}</span> : null}
        </span>
        {index !== undefined && (
          <span className={[
            "navigationDrawerItemBadge",
            completed   ? "navigationDrawerItemBadge--done"   : "",
            active      ? "navigationDrawerItemBadge--active" : "",
            !available  ? "navigationDrawerItemBadge--locked" : "",
          ].filter(Boolean).join(" ")}>
            {completed
              ? <SvgIcon d={CHECK_D} width={11} height={11} />
              : <span>{index + 1}</span>
            }
          </span>
        )}
      </button>
    );
  };

  return (
    <Drawer isOpen={open} onOpenChange={setOpen}>
      <button
        type="button"
        className="topbarMenuButton topbarMenuButton--icon"
        aria-label="Открыть навигацию"
        onClick={() => setOpen(true)}
      >
        <SvgIcon d={MENU_D} width={18} height={18} />
        <span className="srOnly">Меню</span>
      </button>
      <Drawer.Backdrop className="navigationDrawerBackdrop">
        <Drawer.Content placement="left" className="navigationDrawerContent">
          <Drawer.Dialog>
            <Drawer.CloseTrigger className="navigationDrawerClose" aria-label="Закрыть меню" />
            <Drawer.Header className="navigationDrawerHeader">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Drawer.Heading>Навигация</Drawer.Heading>
                <div className="navigationDrawerStatus">{statusLabel}</div>
                <div className="navigationDrawerProgress">
                  <div className="navigationDrawerProgressBar">
                    <div
                      className="navigationDrawerProgressFill"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="navigationDrawerProgressLabel">{completedCount}/{totalWorkflow}</span>
                </div>
              </div>
            </Drawer.Header>
            <Drawer.Body className="navigationDrawerBody">
              <div className="navigationDrawerSection">
                <div className="navigationDrawerSectionTitle">Процесс расчёта</div>
                <nav className="navigationDrawerNav" aria-label="Основные разделы">
                  {workflowItems.map((item, index) => renderItem(item.to, item.label, item.step, index))}
                </nav>
              </div>
              <div className="navigationDrawerSection">
                <div className="navigationDrawerSectionTitle">Дополнительно</div>
                <nav className="navigationDrawerNav" aria-label="Служебные разделы">
                  {utilityItems.map((item) => renderItem(item.to, item.label, item.step))}
                </nav>
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
