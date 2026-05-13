import { NavLink } from "react-router-dom";
import { useMemo } from "react";
import { useWorkflow, isStepAvailable } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";

const navItems = [
  { to: "/import", label: "Импорт", step: WorkflowStep.Import },
  { to: "/configure", label: "Настройки", step: WorkflowStep.Configure },
  { to: "/dashboard", label: "Панель", step: WorkflowStep.Results },
  { to: "/stress", label: "Стрессы", step: WorkflowStep.Stress },
  { to: "/limits", label: "Лимиты", step: WorkflowStep.Limits },
  { to: "/reports", label: "Отчёты", step: WorkflowStep.Export },
  { to: "/hedge", label: "Хедж", step: WorkflowStep.PostActions },
  { to: "/plan-b", label: "План B", step: WorkflowStep.PostActions },
  { to: "/help", label: "Справка", step: WorkflowStep.Import },
  { to: "/portfolio", label: "Портфель", step: WorkflowStep.Import },
];

export default function Sidebar() {
  const items = useMemo(() => navItems, []);
  const { state } = useWorkflow();
  return (
    <aside className="sidebar">
      <div className="logo">RiskCalc</div>
      <nav>
        {items.map((item) => {
          const available = isStepAvailable(state, item.step);
          return (
            <NavLink
              key={item.to}
              to={available ? item.to : "/import"}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              title={available ? item.label : "Недоступно до завершения предыдущих шагов"}
            >
              {item.label} {!available && "🔒"}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
