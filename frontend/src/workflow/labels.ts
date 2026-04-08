import { WorkflowStep } from "./workflowTypes";

export const stepTitle: Record<WorkflowStep, string> = {
  [WorkflowStep.Import]: "Шаг 1. Импорт сделок",
  [WorkflowStep.Validate]: "Шаг 2. Проверка данных",
  [WorkflowStep.MarketData]: "Шаг 3. Рыночные данные",
  [WorkflowStep.Configure]: "Шаг 4. Настройка расчёта",
  [WorkflowStep.CalcRun]: "Шаг 5. Запуск расчёта",
  [WorkflowStep.Results]: "Шаг 6. Результаты",
  [WorkflowStep.Stress]: "Шаг 7. Стресс‑сценарии",
  [WorkflowStep.Limits]: "Шаг 8. Лимиты",
  [WorkflowStep.Margin]: "Шаг 9. Маржа и капитал",
  [WorkflowStep.Export]: "Шаг 10. Отчёты и экспорт",
  [WorkflowStep.PostActions]: "Шаг 11. Песочница",
};

export const stepShortLabel: Record<WorkflowStep, string> = {
  [WorkflowStep.Import]: "Импорт",
  [WorkflowStep.Validate]: "Проверка",
  [WorkflowStep.MarketData]: "Рыночные данные",
  [WorkflowStep.Configure]: "Настройки",
  [WorkflowStep.CalcRun]: "Запуск",
  [WorkflowStep.Results]: "Результаты",
  [WorkflowStep.Stress]: "Стрессы",
  [WorkflowStep.Limits]: "Лимиты",
  [WorkflowStep.Margin]: "Маржа/капитал",
  [WorkflowStep.Export]: "Экспорт",
  [WorkflowStep.PostActions]: "Песочница",
};

