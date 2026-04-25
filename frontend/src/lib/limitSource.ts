export type LimitSource = "draft_auto" | "manual_user" | "manual_approved" | "demo_default";

export function limitSourceLabel(source: LimitSource) {
  switch (source) {
    case "manual_approved":
      return "manual_approved";
    case "manual_user":
      return "manual_user";
    case "demo_default":
      return "demo_default";
    case "draft_auto":
    default:
      return "draft_auto";
  }
}

export function limitSourceStatus(source: LimitSource) {
  switch (source) {
    case "manual_approved":
      return "утверждённая risk-policy";
    case "manual_user":
      return "пользовательские пороги";
    case "demo_default":
      return "демо-пороги";
    case "draft_auto":
    default:
      return "не утверждённая risk-policy";
  }
}

export function limitSourceDescription(source: LimitSource) {
  switch (source) {
    case "manual_approved":
      return "Пороги явно подтверждены пользователем как соответствующие утверждённой risk-policy.";
    case "manual_user":
      return "Пороги введены пользователем и применены к текущему расчёту, но не подтверждены как утверждённая policy.";
    case "demo_default":
      return "Демо-пороги нужны только для проверки интерфейса и не подходят для решений о compliance.";
    case "draft_auto":
    default:
      return "Авто-пороги используются для предварительного контроля и не являются утверждённой risk-policy.";
  }
}

export function isPreliminaryLimitSource(source: LimitSource) {
  return source !== "manual_approved";
}
