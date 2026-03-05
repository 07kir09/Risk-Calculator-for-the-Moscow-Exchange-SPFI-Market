import Papa from "papaparse";
import { ImportLogEntry, PositionDTO } from "../api/types";

function normalizeNumber(value: unknown): number {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number(value);
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const normalized = trimmed.replace(/\u00A0/g, "").replace(/\s+/g, "").replace(",", ".");
  return Number(normalized);
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseFlexibleDate(value: string): Date | null {
  const text = normalizeString(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = text.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(value: string): string {
  const d = parseFlexibleDate(value);
  if (!d) return "";
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string): boolean {
  // Минимально строгая проверка: YYYY-MM-DD (или YYYY-MM-DDTHH:mm…)
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  const t = Date.parse(value);
  return !Number.isNaN(t);
}

function assertRequired(row: Record<string, unknown>, key: string, rowNum: number, log: ImportLogEntry[]): string {
  const v = normalizeString(row[key]);
  if (!v) {
    log.push({ severity: "ERROR", row: rowNum, field: key, message: `Поле "${key}" обязательно` });
  }
  return v;
}

function safePositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function directionToQuantity(direction: string): number {
  const text = direction.toLowerCase();
  if (text.includes("sell") || text.includes("pay fixed")) return -1;
  return 1;
}

function extractUnderlyingSymbol(instrument: string, ccy1: string, ccy2: string): string {
  const m = instrument.toUpperCase().match(/([A-Z]{3}\s*\/\s*[A-Z]{3})/);
  if (m?.[1]) return m[1].replace(/\s+/g, "");
  if (ccy1 && ccy2 && ccy1 !== ccy2) return `${ccy1}/${ccy2}`;
  return instrument || "UNKNOWN";
}

function isTradeExportFormat(row: Record<string, unknown>): boolean {
  const hasProduct = normalizeString(row["Продукт"]) !== "";
  const hasInstrument = normalizeString(row["Инструмент"]) !== "";
  const hasId = normalizeString(row["Номер в клиринговой системе"]) !== "" || normalizeString(row["Номер в торговой системе"]) !== "";
  return hasProduct && hasInstrument && hasId;
}

function parseTradeRow(row: Record<string, unknown>, rowNum: number, rowLog: ImportLogEntry[]): PositionDTO | null {
  const product = normalizeString(row["Продукт"]);
  const productLower = product.toLowerCase();
  const instrument = normalizeString(row["Инструмент"]) || product;
  const direction = normalizeString(row["Направление"]) || "Buy";
  const position_id = normalizeString(row["Номер в клиринговой системе"]) || normalizeString(row["Номер в торговой системе"]);
  if (!position_id) {
    rowLog.push({ severity: "ERROR", row: rowNum, field: "Номер в клиринговой системе", message: "Не задан ID сделки" });
    return null;
  }

  const valuationRaw = normalizeString(row["Дата регистрации"]) || normalizeString(row["Начало"]);
  const maturityRaw = normalizeString(row["Окончание"]) || normalizeString(row["Начало"]);
  const valuationDateIso = toIsoDate(valuationRaw);
  let maturityDateIso = toIsoDate(maturityRaw);
  if (!valuationDateIso || !maturityDateIso) {
    rowLog.push({ severity: "ERROR", row: rowNum, field: "Дата регистрации", message: "Не удалось распознать даты (ожидается DD.MM.YYYY или YYYY-MM-DD)" });
    return null;
  }
  if (Date.parse(maturityDateIso) <= Date.parse(valuationDateIso)) {
    const d = new Date(Date.parse(valuationDateIso) + 24 * 3600 * 1000);
    maturityDateIso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    rowLog.push({ severity: "WARNING", row: rowNum, field: "Окончание", message: "Окончание <= дата регистрации, maturity сдвинута на +1 день" });
  }

  const ccy1 = normalizeString(row["Валюта 1"]).toUpperCase();
  const ccy2 = normalizeString(row["Валюта 2"]).toUpperCase();
  const currency = ccy2 || ccy1 || "RUB";

  const sum1 = normalizeNumber(row["Сумма 1"]);
  const sum2 = normalizeNumber(row["Сумма 2"]);
  const notional = safePositive(Math.abs(sum1), 1);
  const quoteRatio = Number.isFinite(sum1) && sum1 !== 0 && Number.isFinite(sum2) ? Math.abs(sum2 / sum1) : Number.NaN;

  const price = normalizeNumber(row["Цена"]);
  const strikeCol = normalizeNumber(row["Страйк"]);
  const spotCol = normalizeNumber(row["Курс"]);
  const mtm = normalizeNumber(row["Стоимость"]);
  const quantity = directionToQuantity(direction);
  const underlyingSymbol = extractUnderlyingSymbol(instrument, ccy1, ccy2);

  const t = Math.max(1 / 365, (Date.parse(maturityDateIso) - Date.parse(valuationDateIso)) / (365 * 24 * 3600 * 1000));

  if (productLower.includes("cap") || productLower.includes("floor")) {
    const option_type: "call" | "put" = productLower.includes("cap") ? "call" : "put";
    const underlying_price = safePositive(price, safePositive(strikeCol, 0.01));
    const strike = safePositive(strikeCol, underlying_price);
    rowLog.push({ severity: "WARNING", row: rowNum, field: "Продукт", message: "Cap/Floor импортирован как option (упрощенная модель)" });
    return {
      instrument_type: "option",
      position_id,
      option_type,
      style: "european",
      quantity,
      notional,
      underlying_symbol: underlyingSymbol,
      underlying_price,
      strike,
      volatility: 0.2,
      maturity_date: maturityDateIso,
      valuation_date: valuationDateIso,
      risk_free_rate: 0.05,
      dividend_yield: 0,
      currency,
      liquidity_haircut: 0,
      model: "black_scholes",
    };
  }

  if (["irs", "ois", "xccy"].some((tag) => productLower.includes(tag))) {
    const fixedRate = Number.isFinite(price) ? price : 0;
    const riskFreeRate = fixedRate >= 0 && fixedRate <= 1 ? fixedRate : 0.05;
    const discount = Math.exp(-riskFreeRate * t);
    const denom = notional * t * discount;
    const floatRate = Math.abs(denom) > 1e-12 && Number.isFinite(mtm) ? fixedRate + mtm / quantity / denom : riskFreeRate;
    const strike = safePositive(Math.abs(fixedRate), 1e-8);
    return {
      instrument_type: "swap_ir",
      position_id,
      option_type: "call",
      style: "european",
      quantity,
      notional,
      underlying_symbol: underlyingSymbol,
      underlying_price: 1,
      strike,
      volatility: 0,
      maturity_date: maturityDateIso,
      valuation_date: valuationDateIso,
      risk_free_rate: riskFreeRate,
      dividend_yield: 0,
      currency,
      liquidity_haircut: 0,
      fixed_rate: fixedRate,
      float_rate: floatRate,
      day_count: t,
    };
  }

  const strike = safePositive(price, safePositive(quoteRatio, safePositive(spotCol, 1)));
  const riskFreeRate = 0.05;
  const discount = Math.exp(-riskFreeRate * t);
  const impliedUnderlying = strike + (Number.isFinite(mtm) ? mtm / quantity / (notional * discount) : 0);
  const underlying_price = safePositive(impliedUnderlying, safePositive(spotCol, strike));
  return {
    instrument_type: "forward",
    position_id,
    option_type: "call",
    style: "european",
    quantity,
    notional,
    underlying_symbol: underlyingSymbol,
    underlying_price,
    strike,
    volatility: 0,
    maturity_date: maturityDateIso,
    valuation_date: valuationDateIso,
    risk_free_rate: riskFreeRate,
    dividend_yield: 0,
    currency,
    liquidity_haircut: 0,
  };
}

export function parsePortfolioCsv(text: string): { positions: PositionDTO[]; log: ImportLogEntry[] } {
  const log: ImportLogEntry[] = [];
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });

  if (parsed.errors?.length) {
    for (const e of parsed.errors.slice(0, 50)) {
      log.push({ severity: "ERROR", message: `Ошибка CSV: ${e.message}`, row: typeof e.row === "number" ? e.row + 1 : undefined });
    }
  }

  const rows = parsed.data ?? [];
  if (!rows.length) {
    log.push({ severity: "ERROR", message: "Файл пустой или не содержит строк данных." });
    return { positions: [], log };
  }

  const positions: PositionDTO[] = [];
  const tradeMode = rows.some((row) => isTradeExportFormat(row));

  rows.forEach((row, i) => {
    const rowNum = i + 2; // 1 — header
    const rowLog: ImportLogEntry[] = [];

    if (tradeMode) {
      const pos = parseTradeRow(row, rowNum, rowLog);
      const hasErrors = rowLog.some((x) => x.severity === "ERROR");
      log.push(...rowLog);
      if (!hasErrors && pos) positions.push(pos);
      return;
    }

    const instrument_type = assertRequired(row, "instrument_type", rowNum, rowLog).toLowerCase();
    const position_id = assertRequired(row, "position_id", rowNum, rowLog);
    const currency = assertRequired(row, "currency", rowNum, rowLog).toUpperCase();
    const underlying_symbol = assertRequired(row, "underlying_symbol", rowNum, rowLog);

    const quantity = normalizeNumber(assertRequired(row, "quantity", rowNum, rowLog));
    const notional = normalizeNumber(assertRequired(row, "notional", rowNum, rowLog));
    const underlying_price = normalizeNumber(assertRequired(row, "underlying_price", rowNum, rowLog));
    const strike = normalizeNumber(assertRequired(row, "strike", rowNum, rowLog));
    const risk_free_rate = normalizeNumber(assertRequired(row, "risk_free_rate", rowNum, rowLog));

    const maturity_date = assertRequired(row, "maturity_date", rowNum, rowLog);
    const valuation_date = assertRequired(row, "valuation_date", rowNum, rowLog);

    const option_type_input = normalizeString(row["option_type"]);
    const style_input = normalizeString(row["style"]);
    const option_type_raw = (option_type_input || "call").toLowerCase();
    const style_raw = (style_input || "european").toLowerCase();

    const instrumentTypes = new Set(["option", "forward", "swap_ir"]);
    if (instrument_type && !instrumentTypes.has(instrument_type)) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "instrument_type", message: `Недопустимый instrument_type: "${instrument_type}"` });
    }

    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "currency", message: `Валюта должна быть ISO 4217 (например, RUB), получено: "${currency}"` });
    }

    if (!Number.isFinite(quantity) || quantity === 0) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "quantity", message: "quantity должен быть числом и не равен 0" });
    }
    if (!Number.isFinite(notional) || notional < 0) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "notional", message: "notional должен быть числом и не отрицательным" });
    }
    if (!Number.isFinite(underlying_price) || underlying_price <= 0) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "underlying_price", message: "underlying_price должен быть > 0" });
    }
    if (!Number.isFinite(strike) || strike <= 0) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "strike", message: "strike должен быть > 0" });
    }
    if (!Number.isFinite(risk_free_rate)) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "risk_free_rate", message: "risk_free_rate должен быть числом" });
    } else if (risk_free_rate < -1) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "risk_free_rate", message: "risk_free_rate не может быть меньше -1" });
    }

    if (maturity_date && !isIsoDate(maturity_date)) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "maturity_date", message: `Дата должна быть ISO (YYYY-MM-DD), получено: "${maturity_date}"` });
    }
    if (valuation_date && !isIsoDate(valuation_date)) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "valuation_date", message: `Дата должна быть ISO (YYYY-MM-DD), получено: "${valuation_date}"` });
    }
    if (isIsoDate(maturity_date) && isIsoDate(valuation_date)) {
      if (Date.parse(maturity_date) <= Date.parse(valuation_date)) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "maturity_date", message: "maturity_date должен быть позже valuation_date" });
      }
    }

    const optionTypes = new Set(["call", "put"]);
    const styles = new Set(["european", "american"]);
    if (!optionTypes.has(option_type_raw)) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "option_type", message: `option_type должен быть call/put, получено: "${option_type_raw}"` });
    }
    if (!styles.has(style_raw)) {
      rowLog.push({ severity: "ERROR", row: rowNum, field: "style", message: `style должен быть european/american, получено: "${style_raw}"` });
    }
    if (instrument_type !== "option") {
      if (option_type_input === "") {
        rowLog.push({ severity: "WARNING", row: rowNum, field: "option_type", message: "option_type не задан — оставили значение по умолчанию (call)" });
      }
      if (style_input === "") {
        rowLog.push({ severity: "WARNING", row: rowNum, field: "style", message: "style не задан — оставили значение по умолчанию (european)" });
      }
    }

    const volatilityRaw = normalizeString(row["volatility"]);
    const volatility = volatilityRaw === "" ? (instrument_type === "option" ? Number.NaN : 0.0) : normalizeNumber(volatilityRaw);
    if (instrument_type === "option") {
      if (!Number.isFinite(volatility) || volatility <= 0) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "volatility", message: "Для опциона volatility должен быть числом и > 0" });
      }
    } else {
      if (!Number.isFinite(volatility) || volatility < 0) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "volatility", message: "volatility должен быть числом и не отрицательным" });
      }
    }

    const dividend_yield = normalizeString(row["dividend_yield"]);
    const liquidity_haircut = normalizeString(row["liquidity_haircut"]);
    const model = normalizeString(row["model"]);
    const fixed_rate = normalizeString(row["fixed_rate"]);
    const float_rate = normalizeString(row["float_rate"]);
    const day_count = normalizeString(row["day_count"]);

    let dividendYieldValue: number | undefined;
    if (dividend_yield !== "") {
      const value = normalizeNumber(dividend_yield);
      if (!Number.isFinite(value)) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "dividend_yield", message: "dividend_yield должен быть числом" });
      } else if (value < 0) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "dividend_yield", message: "dividend_yield не может быть отрицательным" });
      } else {
        dividendYieldValue = value;
      }
    }

    let liquidityHaircutValue: number | undefined;
    if (liquidity_haircut !== "") {
      const value = normalizeNumber(liquidity_haircut);
      if (!Number.isFinite(value)) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "liquidity_haircut", message: "liquidity_haircut должен быть числом" });
      } else if (value < 0) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "liquidity_haircut", message: "liquidity_haircut не может быть отрицательным" });
      } else {
        liquidityHaircutValue = value;
      }
    }

    let fixedRateValue: number | undefined;
    if (fixed_rate !== "") {
      const value = normalizeNumber(fixed_rate);
      if (!Number.isFinite(value)) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "fixed_rate", message: "fixed_rate должен быть числом" });
      } else {
        fixedRateValue = value;
      }
    }

    let floatRateValue: number | undefined;
    if (float_rate !== "") {
      const value = normalizeNumber(float_rate);
      if (!Number.isFinite(value)) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "float_rate", message: "float_rate должен быть числом" });
      } else {
        floatRateValue = value;
      }
    }

    let dayCountValue: number | undefined;
    if (day_count !== "") {
      const value = normalizeNumber(day_count);
      if (!Number.isFinite(value)) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "day_count", message: "day_count должен быть числом" });
      } else if (instrument_type === "swap_ir" && value <= 0) {
        rowLog.push({ severity: "ERROR", row: rowNum, field: "day_count", message: "day_count для swap_ir должен быть > 0" });
      } else {
        dayCountValue = value;
      }
    }

    const hasErrors = rowLog.some((x) => x.severity === "ERROR");
    log.push(...rowLog);
    if (hasErrors) return;

    const pos: PositionDTO = {
      instrument_type: instrument_type as PositionDTO["instrument_type"],
      position_id,
      option_type: (option_type_raw as any) || "call",
      style: (style_raw as any) || "european",
      quantity,
      notional,
      underlying_symbol,
      underlying_price,
      strike,
      volatility,
      maturity_date,
      valuation_date,
      risk_free_rate,
      currency,
    };

    if (dividendYieldValue !== undefined) pos.dividend_yield = dividendYieldValue;
    if (liquidityHaircutValue !== undefined) pos.liquidity_haircut = liquidityHaircutValue;
    if (model !== "") pos.model = model;
    if (fixedRateValue !== undefined) pos.fixed_rate = fixedRateValue;
    if (floatRateValue !== undefined) pos.float_rate = floatRateValue;
    if (dayCountValue !== undefined) pos.day_count = dayCountValue;

    positions.push(pos);
  });

  if (!positions.length) {
    log.push({ severity: "ERROR", message: "Не удалось импортировать ни одной сделки: исправьте ошибки и загрузите файл заново." });
  }

  return { positions, log };
}
