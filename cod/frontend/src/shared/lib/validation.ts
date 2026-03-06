import { PositionDraft, ScenarioDraft } from "../types/contracts";

export type FieldIssue = {
  field: string;
  message: string;
  rowIndex?: number;
};

function isValidDate(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

export function validatePosition(position: PositionDraft, rowIndex?: number): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const type = position.instrument_type ?? "option";

  if (!position.position_id) issues.push({ field: "position_id", message: "обязательное поле", rowIndex });
  if (!position.underlying_symbol) issues.push({ field: "underlying_symbol", message: "обязательное поле", rowIndex });
  if (position.quantity === 0) issues.push({ field: "quantity", message: "не должно быть равно 0", rowIndex });
  if (position.underlying_price <= 0) issues.push({ field: "underlying_price", message: "должно быть > 0", rowIndex });
  if (position.strike <= 0) {
    issues.push({ field: "strike", message: "должно быть > 0", rowIndex });
  }
  if (!isValidDate(position.valuation_date) || !isValidDate(position.maturity_date)) {
    issues.push({ field: "maturity_date", message: "дата должна быть в корректном формате", rowIndex });
  } else if (Date.parse(position.maturity_date) <= Date.parse(position.valuation_date)) {
    issues.push({ field: "maturity_date", message: "дата погашения должна быть позже даты оценки", rowIndex });
  }

  const currency = (position.currency ?? "RUB").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push({ field: "currency", message: "должен быть 3-буквенный код", rowIndex });
  }

  if ((position.notional ?? 1) < 0) {
    issues.push({ field: "notional", message: "не должно быть отрицательным", rowIndex });
  }

  if ((position.liquidity_haircut ?? 0) < 0) {
    issues.push({ field: "liquidity_haircut", message: "не должно быть отрицательным", rowIndex });
  }

  if (position.risk_free_rate < -1) {
    issues.push({ field: "risk_free_rate", message: "слишком маленькое значение (< -100%)", rowIndex });
  }

  if ((position.dividend_yield ?? 0) < 0) {
    issues.push({ field: "dividend_yield", message: "не должно быть отрицательным", rowIndex });
  }

  if (type === "option") {
    if ((position.volatility ?? 0) <= 0) {
      issues.push({ field: "volatility", message: "для опциона должна быть > 0", rowIndex });
    }
  } else if ((position.volatility ?? 0) < 0) {
    issues.push({ field: "volatility", message: "для форварда/свопа не должна быть < 0", rowIndex });
  }

  if (type === "swap_ir" && position.day_count !== undefined && position.day_count !== null && position.day_count <= 0) {
    issues.push({ field: "day_count", message: "для свопа должно быть > 0", rowIndex });
  }

  return issues;
}

export function validateScenario(scenario: ScenarioDraft, rowIndex?: number): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (!scenario.scenario_id) {
    issues.push({ field: "scenario_id", message: "обязательное поле", rowIndex });
  }
  if (scenario.probability !== null && scenario.probability !== undefined && scenario.probability < 0) {
    issues.push({ field: "probability", message: "должно быть >= 0", rowIndex });
  }
  return issues;
}

export function validateScenarioProbabilityMode(scenarios: ScenarioDraft[]): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const withValue = scenarios.filter((scenario) => scenario.probability !== null && scenario.probability !== undefined);
  if (withValue.length === 0) {
    return issues;
  }
  scenarios.forEach((scenario, index) => {
    if (scenario.probability === null || scenario.probability === undefined) {
      issues.push({
        field: "probability",
        message: "обязательно для всех сценариев в вероятностном режиме",
        rowIndex: index,
      });
    }
  });
  return issues;
}

export function hasCriticalClientErrors(issues: FieldIssue[]): boolean {
  return issues.length > 0;
}
