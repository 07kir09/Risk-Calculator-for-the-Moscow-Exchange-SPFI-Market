import { NavLink, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { isStepAvailable, useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { orderedSteps } from "../workflow/order";
import { stepTitle } from "../workflow/labels";
import { stepToRoute } from "../workflow/routes";

type NavItem = { to: string; label: string; step?: WorkflowStep; right?: string };

const workflowItems: NavItem[] = [
  { to: "/import", label: "1. Импорт сделок", step: WorkflowStep.Import },
  { to: "/validate", label: "2. Проверка данных", step: WorkflowStep.Validate },
  { to: "/market", label: "3. Рыночные данные", step: WorkflowStep.MarketData },
  { to: "/configure", label: "4. Настройки расчёта", step: WorkflowStep.Configure },
  { to: "/run", label: "5. Запуск расчёта", step: WorkflowStep.CalcRun },
  { to: "/dashboard", label: "6. Результаты", step: WorkflowStep.Results },
  { to: "/stress", label: "7. Стресс‑сценарии", step: WorkflowStep.Stress },
  { to: "/limits", label: "8. Лимиты", step: WorkflowStep.Limits },
  { to: "/margin", label: "9. Маржа и капитал", step: WorkflowStep.Margin },
  { to: "/export", label: "10. Отчёты и экспорт", step: WorkflowStep.Export },
  { to: "/actions", label: "11. Песочница (What‑if/хедж)", step: WorkflowStep.PostActions },
];

const dataItems: NavItem[] = [{ to: "/portfolio", label: "Портфель (просмотр)" }];

const helpItems: NavItem[] = [{ to: "/help", label: "Справка" }];

function LockIcon() {
  return (
    <svg className="navItemIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z"
      />
    </svg>
  );
}

function DotIcon() {
  return (
    <svg className="navItemIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10Z" />
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
  const items = useMemo(() => workflowItems, []);
  const data = useMemo(() => dataItems, []);
  const help = useMemo(() => helpItems, []);
  const { state } = useWorkflow();
  const nav = useNavigate();

  const firstIncomplete = useMemo(() => {
    for (const step of orderedSteps) {
      if (step === WorkflowStep.Margin && !state.calcConfig.marginEnabled) continue;
      if (!state.completedSteps.includes(step)) return step;
    }
    return WorkflowStep.Results;
  }, [state.calcConfig.marginEnabled, state.completedSteps]);

  return (
    <aside className={`appSidebar ${mobileOpen ? "appSidebar--mobileOpen" : ""}`} aria-label="Навигация">
      <div className={`appSidebarHeader ${collapsed ? "appSidebarHeader--collapsed" : ""}`}>
        <div className="brand" title="Риск‑калькулятор СПФИ (MOEX)">
          <div className="brandMark">R</div>
          {!collapsed && (
            <div className="brandText">
              <div className="brandTitle">Риск‑калькулятор</div>
              <div className="brandSubtitle">СПФИ (MOEX)</div>
            </div>
          )}
        </div>
      </div>

      <div className="appSidebarScroll">
        <div className="navGroupLabel">Данные</div>
        {data.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => onCloseMobile()}
            className={({ isActive }) => `navItem ${isActive ? "navItem--active" : ""}`}
            title={item.label}
          >
            <DotIcon />
            {!collapsed && <span className="navItemLabel">{item.label}</span>}
          </NavLink>
        ))}

        <div className="navGroupLabel">Рабочий процесс</div>
        {items.map((item) => {
          const available = item.step ? isStepAvailable(state, item.step) : true;
          const title = available ? item.label : "Сначала завершите предыдущие шаги";

          if (!available) {
            const target = stepToRoute[firstIncomplete] ?? "/import";
            const reason = `Чтобы открыть «${item.label}», сначала завершите: ${stepTitle[firstIncomplete]}`;
            return (
              <button
                key={item.to}
                className="navItem navItem--locked"
                title={title}
                type="button"
                onClick={() => {
                  onCloseMobile();
                  nav(target, { state: { reason } });
                }}
              >
                <LockIcon />
                {!collapsed && <span className="navItemLabel">{item.label}</span>}
                {!collapsed && <span className="navItemRight">Недоступно</span>}
              </button>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => onCloseMobile()}
              className={({ isActive }) => `navItem ${isActive ? "navItem--active" : ""}`}
              title={title}
            >
              <DotIcon />
              {!collapsed && <span className="navItemLabel">{item.label}</span>}
            </NavLink>
          );
        })}

        <div className="navGroupLabel">Справка</div>
        {help.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => onCloseMobile()}
            className={({ isActive }) => `navItem ${isActive ? "navItem--active" : ""}`}
            title={item.label}
          >
            <DotIcon />
            {!collapsed && <span className="navItemLabel">{item.label}</span>}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
