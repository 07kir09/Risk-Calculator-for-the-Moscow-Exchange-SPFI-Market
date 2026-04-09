import { WorkflowStep } from "../workflow/workflowTypes";

export type NavItem = { to: string; label: string; step?: WorkflowStep };

export const workflowItems: NavItem[] = [
  { to: "/import", label: "Импорт", step: WorkflowStep.Import },
  { to: "/validate", label: "Проверка данных", step: WorkflowStep.Validate },
  { to: "/market", label: "Рыночные данные", step: WorkflowStep.MarketData },
  { to: "/configure", label: "Настройка расчета", step: WorkflowStep.Configure },
  { to: "/dashboard", label: "Панель риска", step: WorkflowStep.Results },
  { to: "/stress", label: "Стресс-сценарии", step: WorkflowStep.Stress },
  { to: "/limits", label: "Лимиты", step: WorkflowStep.Limits },
  { to: "/margin", label: "Маржа и капитал", step: WorkflowStep.Margin },
  { to: "/export", label: "Экспорт", step: WorkflowStep.Export },
  { to: "/actions", label: "What-if и хедж", step: WorkflowStep.PostActions },
];

export const utilityItems: NavItem[] = [
  { to: "/portfolio", label: "Просмотр портфеля" },
  { to: "/help", label: "Справка" },
];
