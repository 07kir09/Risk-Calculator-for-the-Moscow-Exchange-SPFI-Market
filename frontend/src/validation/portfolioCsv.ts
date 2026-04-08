import Papa from "papaparse";
import { ImportLogEntry, PositionDTO } from "../api/types";

const DISCOUNT_CURVE_REF_BY_CCY_AND_CSA: Record<string, string> = {
  "RUB|RUB": "RUB-DISCOUNT-RUB-CSA",
  "RUB|USD": "RUB-DISCOUNT-USD-CSA",
  "RUB|EUR": "RUB-DISCOUNT-EUR-CSA",
  "RUB|CNY": "RUB-DISCOUNT-CNY-CSA",
  "USD|RUB": "USD-DISCOUNT-RUB-CSA",
  "USD|USD": "USD-DISCOUNT-USD-CSA",
  "USD|EUR": "USD-DISCOUNT-EUR-CSA",
  "USD|CNY": "USD-DISCOUNT-CNY-CSA",
  "EUR|RUB": "EUR-DISCOUNT-RUB-CSA",
  "EUR|USD": "EUR-DISCOUNT-USD-CSA",
  "EUR|EUR": "EUR-DISCOUNT-EUR-CSA",
  "EUR|CNY": "EUR-DISCOUNT-CNY-CSA",
  "CNY|RUB": "CNY-DISCOUNT-RUB-CSA",
  "CNY|USD": "CNY-DISCOUNT-USD-CSA",
  "CNY|EUR": "CNY-DISCOUNT-EUR-CSA",
  "CNY|CNY": "CNY-DISCOUNT-CNY-CSA",
};

const PROJECTION_CURVE_REF_BY_KEY: Record<string, string> = {
  RUB_KEYRATE: "RUB-CBR-KEY-RATE",
  RUB_RUONIA: "RUB-RUONIA-OIS-COMPOUND",
  RUB_RUSFAR_ON: "RUB-RUSFAR-OIS-COMPOUND",
  RUB_RUSFAR_3M: "RUB-RUSFAR-3M",
  CNY_RUSFARCNY_OIS: "CNY-RUSFARCNY-OIS-COMPOUND",
  CNY_REPO: "CNY-REPO-RATE",
  EUR_ESTR: "EUR-ESTR",
  EUR_EURIBOR_1M: "EUR-EURIBOR-Act/365-1M",
  EUR_EURIBOR_3M: "EUR-EURIBOR-Act/365-3M",
  EUR_EURIBOR_6M: "EUR-EURIBOR-Act/365-6M",
  USD_SOFR: "USD-SOFR",
  USD_OISFX: "USD-OISFX",
};

const FIXING_REF_BY_KEY: Record<string, string> = {
  RUB_KEYRATE: "RUB KeyRate",
  RUB_RUONIA: "RUONIA Avg.",
  RUB_RUSFAR_ON: "RusFar RUB O/N",
  RUB_RUSFAR_3M: "RUSFAR RUB 3m",
  CNY_RUSFARCNY_OIS: "RUSFARCNY Comp.",
  CNY_REPO: "FR007 CNY 1w",
  EUR_ESTR: "ESTR Comp.",
  EUR_EURIBOR_1M: "Euribor EUR 1m",
  EUR_EURIBOR_3M: "Euribor EUR 3m",
  EUR_EURIBOR_6M: "Euribor EUR 6m",
  USD_SOFR: "SOFR Comp.",
  USD_OISFX: "OIS FX",
};

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

function monthsBetweenIso(startIso: string, endIso: string): number {
  const days = Math.max((Date.parse(endIso) - Date.parse(startIso)) / (24 * 3600 * 1000), 1);
  return Math.max(1, Math.round(days / 30.4375));
}

function inferTenorMonthsFromText(text: string): number | undefined {
  const matches = [...text.toUpperCase().matchAll(/(\d+)\s*([WMY])\b/g)];
  const last = matches[matches.length - 1];
  if (!last) return undefined;
  const value = Number(last[1]);
  const unit = last[2];
  if (!Number.isFinite(value)) return undefined;
  if (unit === "W") return Math.max(1, Math.round(value / 4));
  if (unit === "M") return value;
  return value * 12;
}

function defaultCalendar(currency: string): string {
  return currency.toUpperCase() === "EUR" ? "TARGET" : currency.toUpperCase();
}

function jointCalendar(...currencies: string[]): string {
  return [...new Set(currencies.filter(Boolean).map((currency) => defaultCalendar(currency)))].sort().join("+");
}

function inferCollateralCurrency(instrumentText: string, productText: string, currencies: string[]): string | undefined {
  const upper = `${productText} ${instrumentText}`.toUpperCase();
  const explicit = upper.match(/\b(RUB|USD|EUR|CNY)\s*CSA\b/);
  if (explicit?.[1]) return explicit[1];
  if (upper.includes("RUONIA") || upper.includes("KEY RATE") || upper.includes("KEYRATE") || (upper.includes("RUSFAR") && !upper.includes("CNY"))) return "RUB";
  if (upper.includes("SOFR") || upper.includes("LIBOR USD") || upper.includes("OIS FX") || upper.includes("OISFX")) return "USD";
  if (upper.includes("ESTR") || upper.includes("EURIBOR")) return "EUR";
  if (upper.includes("RUSFARCNY") || upper.includes("FR007")) return "CNY";
  const normalized = currencies.filter(Boolean).map((currency) => currency.toUpperCase());
  for (const preferred of ["USD", "RUB", "EUR", "CNY"]) {
    if (normalized.includes(preferred)) return preferred;
  }
  return normalized[0];
}

function inferResetConvention(curveRef?: string, instrumentText = ""): string {
  const upper = `${curveRef || ""} ${instrumentText}`.toUpperCase();
  if (upper.includes("OISFX") || upper.includes("OIS FX")) return "in_advance";
  return ["OIS", "O/N", "AVG", "COMP"].some((token) => upper.includes(token)) ? "in_arrears" : "in_advance";
}

function inferRateFixingLagDays(curveRef?: string, instrumentText = "", currency = ""): number {
  const upper = `${curveRef || ""} ${instrumentText}`.toUpperCase();
  if (upper.includes("OISFX") || upper.includes("OIS FX")) return 2;
  if (["OIS", "O/N", "AVG", "COMP", "KEY RATE", "KEYRATE"].some((token) => upper.includes(token))) return 0;
  if (currency.toUpperCase() === "RUB" && !upper.includes("RUSFAR-3M")) return 0;
  return 2;
}

function currencyDayCount(currency: string, curveRef?: string): string {
  const upper = (curveRef || "").toUpperCase();
  if (upper.includes("ACT/365") || currency.toUpperCase() === "RUB") return "ACT/365";
  return "ACT/360";
}

function periodicityMonthsFromCurveRef(curveRef?: string, defaultMonths = 3): number {
  const upper = (curveRef || "").toUpperCase();
  if (upper.includes("OISFX") || upper.includes("OIS FX")) return 3;
  for (const months of [12, 6, 3, 1]) {
    if (upper.includes(`${months}M`)) return months;
  }
  if (["OIS", "O/N", "AVG", "COMP"].some((token) => upper.includes(token))) return 12;
  return defaultMonths;
}

function fixedLegFrequency(totalMonths: number, floatFrequencyMonths: number, productText: string): number {
  const upper = productText.toUpperCase();
  if (upper.includes("OIS")) return totalMonths >= 12 ? 12 : Math.max(1, totalMonths);
  if (totalMonths >= 12) return 6;
  return floatFrequencyMonths;
}

function extractCurrencyPair(symbol: string, ccy1: string, ccy2: string): [string, string] | null {
  const upper = symbol.toUpperCase().replace(/\s+/g, "");
  if (upper.includes("/")) {
    const [left, right] = upper.split("/", 2);
    if (left?.length === 3 && right?.length === 3) return [left, right];
  }
  if (upper.length === 6 && /^[A-Z]+$/.test(upper)) return [upper.slice(0, 3), upper.slice(3)];
  if (ccy1.length === 3 && ccy2.length === 3 && ccy1 !== ccy2) return [ccy1, ccy2];
  return null;
}

function projectionKeysForTrade(instrumentText: string, currency: string, productText: string): string[] {
  const upper = instrumentText.toUpperCase();
  const currencyUpper = currency.toUpperCase();
  const productUpper = productText.toUpperCase();
  const isCrossCurrency = productUpper.includes("XCCY") || productUpper.includes("BASIS");
  const keys: string[] = [];

  if (currencyUpper === "RUB") {
    if (upper.includes("KEYRATE") || upper.includes("KEY RATE")) keys.push("RUB_KEYRATE");
    if (upper.includes("RUONIA")) keys.push("RUB_RUONIA");
    if (upper.includes("RUSFAR") && upper.includes("3M") && !upper.includes("CNY")) keys.push("RUB_RUSFAR_3M");
    if (upper.includes("RUSFAR") && !upper.includes("3M") && !upper.includes("CNY")) keys.push("RUB_RUSFAR_ON");
  } else if (currencyUpper === "CNY") {
    if (upper.includes("RUSFARCNY")) keys.push("CNY_RUSFARCNY_OIS");
    if (upper.includes("FR007") || (upper.includes("REPO") && upper.includes("CNY"))) keys.push("CNY_REPO");
  } else if (currencyUpper === "EUR") {
    if (upper.includes("ESTR")) keys.push("EUR_ESTR");
    if (upper.includes("EURIBOR") && upper.includes("1M")) keys.push("EUR_EURIBOR_1M");
    if (upper.includes("EURIBOR") && upper.includes("3M")) keys.push("EUR_EURIBOR_3M");
    if (upper.includes("EURIBOR") && upper.includes("6M")) keys.push("EUR_EURIBOR_6M");
  } else if (currencyUpper === "USD") {
    if (upper.includes("OIS FX") || upper.includes("OISFX") || (upper.includes("LIBOR") && upper.includes("USD")) || isCrossCurrency) {
      keys.push("USD_OISFX");
    }
    if (upper.includes("SOFR")) keys.push("USD_SOFR");
  }

  if (!keys.length) {
    if (currencyUpper === "RUB") keys.push(productUpper.includes("OIS") || isCrossCurrency ? "RUB_RUONIA" : "RUB_RUSFAR_3M");
    if (currencyUpper === "CNY") keys.push(productUpper.includes("OIS") || isCrossCurrency ? "CNY_RUSFARCNY_OIS" : "CNY_REPO");
    if (currencyUpper === "EUR") keys.push(productUpper.includes("OIS") ? "EUR_ESTR" : "EUR_EURIBOR_3M");
    if (currencyUpper === "USD") keys.push(isCrossCurrency ? "USD_OISFX" : "USD_SOFR");
  }

  return [...new Set(keys)];
}

function selectProjectionCurve(instrumentText: string, currency: string, productText: string): string | undefined {
  for (const key of projectionKeysForTrade(instrumentText, currency, productText)) {
    const ref = PROJECTION_CURVE_REF_BY_KEY[key];
    if (ref) return ref;
  }
  return undefined;
}

function selectFixingIndex(instrumentText: string, currency: string, productText: string): string | undefined {
  for (const key of projectionKeysForTrade(instrumentText, currency, productText)) {
    const ref = FIXING_REF_BY_KEY[key];
    if (ref) return ref;
  }
  return undefined;
}

function selectDiscountCurve(currency: string, collateralCurrency?: string): string | undefined {
  const ccy = currency.toUpperCase();
  const collateral = (collateralCurrency || ccy).toUpperCase();
  return DISCOUNT_CURVE_REF_BY_CCY_AND_CSA[`${ccy}|${collateral}`] || DISCOUNT_CURVE_REF_BY_CCY_AND_CSA[`${ccy}|${ccy}`];
}

function enrichTradePosition(params: {
  position: PositionDTO;
  product: string;
  instrument: string;
  ccy1: string;
  ccy2: string;
  sum1: number;
  sum2: number;
  startDateIso: string;
  rowLog: ImportLogEntry[];
  rowNum: number;
}): PositionDTO {
  const { position, product, instrument, ccy1, ccy2, sum1, sum2, startDateIso, rowLog, rowNum } = params;
  const totalMonths = inferTenorMonthsFromText(instrument) ?? monthsBetweenIso(startDateIso, position.maturity_date);
  const collateralCurrency = inferCollateralCurrency(instrument, product, [ccy1, ccy2, position.currency]);
  const enriched: PositionDTO = {
    ...position,
    start_date: startDateIso,
    settlement_date: position.maturity_date,
    collateral_currency: collateralCurrency,
  };

  if (position.instrument_type === "forward") {
    const pair = extractCurrencyPair(position.underlying_symbol, ccy1, ccy2);
    if (pair) {
      const [baseCurrency, quoteCurrency] = pair;
      enriched.receive_currency = baseCurrency;
      enriched.pay_currency = quoteCurrency;
      enriched.receive_discount_curve_ref = selectDiscountCurve(baseCurrency, collateralCurrency);
      enriched.pay_discount_curve_ref = selectDiscountCurve(quoteCurrency, collateralCurrency);
      if (Number.isFinite(sum1)) enriched.receive_leg_notional = Math.abs(sum1);
      if (Number.isFinite(sum2)) enriched.pay_leg_notional = Math.abs(sum2);
      enriched.spot_fx = position.underlying_price;
      enriched.pay_calendar = jointCalendar(baseCurrency, quoteCurrency);
      enriched.receive_calendar = jointCalendar(baseCurrency, quoteCurrency);
      enriched.pay_business_day_convention = "modified_following";
      enriched.receive_business_day_convention = "modified_following";
      if (!enriched.receive_discount_curve_ref || !enriched.pay_discount_curve_ref) {
        rowLog.push({
          severity: "WARNING",
          row: rowNum,
          field: "Инструмент",
          message: "Не удалось автоматически определить обе discount curves для FX forward.",
        });
      }
    } else {
      const projectionCurveRef = selectProjectionCurve(instrument, position.currency, product);
      enriched.discount_curve_ref = selectDiscountCurve(position.currency, collateralCurrency);
      enriched.projection_curve_ref = projectionCurveRef;
      enriched.business_day_convention = "modified_following";
      enriched.pay_calendar = defaultCalendar(position.currency);
      enriched.receive_calendar = defaultCalendar(position.currency);
      enriched.fixing_days_lag = inferRateFixingLagDays(projectionCurveRef, instrument, position.currency);
      enriched.reset_convention = inferResetConvention(projectionCurveRef, instrument);
    }
    return enriched;
  }

  if (position.instrument_type !== "swap_ir") return enriched;

  const productUpper = product.toUpperCase();
  if ((productUpper.includes("XCCY") || productUpper.includes("BASIS")) && ccy1 && ccy2 && ccy1 !== ccy2) {
    const payProjectionCurveRef = selectProjectionCurve(instrument, ccy1, product);
    const receiveProjectionCurveRef = selectProjectionCurve(instrument, ccy2, product);
    const floatFrequencyMonths = Math.max(
      periodicityMonthsFromCurveRef(payProjectionCurveRef, 3),
      periodicityMonthsFromCurveRef(receiveProjectionCurveRef, 3),
    );
    enriched.pay_currency = ccy1;
    enriched.receive_currency = ccy2;
    enriched.pay_leg_notional = Number.isFinite(sum1) ? Math.abs(sum1) : position.notional;
    enriched.receive_leg_notional = Number.isFinite(sum2) ? Math.abs(sum2) : position.notional;
    enriched.pay_discount_curve_ref = selectDiscountCurve(ccy1, collateralCurrency);
    enriched.receive_discount_curve_ref = selectDiscountCurve(ccy2, collateralCurrency);
    enriched.pay_projection_curve_ref = payProjectionCurveRef;
    enriched.receive_projection_curve_ref = receiveProjectionCurveRef;
    enriched.exchange_principal = true;
    enriched.pay_calendar = jointCalendar(ccy1, ccy2);
    enriched.receive_calendar = jointCalendar(ccy1, ccy2);
    enriched.pay_fixing_calendar = defaultCalendar(ccy1);
    enriched.receive_fixing_calendar = defaultCalendar(ccy2);
    enriched.pay_business_day_convention = "modified_following";
    enriched.receive_business_day_convention = "modified_following";
    enriched.pay_day_count_convention = currencyDayCount(ccy1, payProjectionCurveRef);
    enriched.receive_day_count_convention = currencyDayCount(ccy2, receiveProjectionCurveRef);
    enriched.pay_reset_convention = inferResetConvention(payProjectionCurveRef, instrument);
    enriched.receive_reset_convention = inferResetConvention(receiveProjectionCurveRef, instrument);
    enriched.pay_fixing_days_lag = inferRateFixingLagDays(payProjectionCurveRef, instrument, ccy1);
    enriched.receive_fixing_days_lag = inferRateFixingLagDays(receiveProjectionCurveRef, instrument, ccy2);
    enriched.pay_payment_lag_days = 0;
    enriched.receive_payment_lag_days = 0;
    enriched.float_leg_frequency_months = floatFrequencyMonths;
    enriched.fixed_leg_frequency_months = productUpper.includes("BASIS")
      ? floatFrequencyMonths
      : fixedLegFrequency(totalMonths, floatFrequencyMonths, product);
    enriched.day_count_convention = ccy1 === "RUB" || ccy2 === "RUB" ? "ACT/365" : currencyDayCount(ccy2);
    enriched.business_day_convention = "modified_following";
    if (productUpper.includes("BASIS")) {
      enriched.pay_spread = position.fixed_rate ?? 0;
      enriched.fixed_rate = null;
      enriched.pay_fixed_rate = null;
      enriched.receive_fixed_rate = null;
    }
    if (!enriched.pay_discount_curve_ref || !enriched.receive_discount_curve_ref) {
      rowLog.push({
        severity: "WARNING",
        row: rowNum,
        field: "Валюта 1",
        message: "Не удалось автоматически определить обе discount curves для cross-currency swap.",
      });
    }
    return enriched;
  }

  const projectionCurveRef = selectProjectionCurve(instrument, position.currency, product);
  const fixingIndexRef = selectFixingIndex(instrument, position.currency, product);
  const discountCurveRef = selectDiscountCurve(position.currency, collateralCurrency);
  const floatFrequencyMonths = periodicityMonthsFromCurveRef(projectionCurveRef, 3);
  enriched.discount_curve_ref = discountCurveRef;
  enriched.projection_curve_ref = projectionCurveRef;
  enriched.fixing_index_ref = fixingIndexRef;
  enriched.fixing_days_lag = inferRateFixingLagDays(projectionCurveRef, instrument, position.currency);
  enriched.reset_convention = inferResetConvention(projectionCurveRef, instrument);
  enriched.day_count_convention = currencyDayCount(position.currency, projectionCurveRef || discountCurveRef);
  enriched.business_day_convention = "modified_following";
  enriched.pay_calendar = defaultCalendar(position.currency);
  enriched.receive_calendar = defaultCalendar(position.currency);
  enriched.float_leg_frequency_months = floatFrequencyMonths;
  enriched.fixed_leg_frequency_months = fixedLegFrequency(totalMonths, floatFrequencyMonths, product);
  if (!discountCurveRef || !projectionCurveRef) {
    rowLog.push({
      severity: "WARNING",
      row: rowNum,
      field: "Инструмент",
      message: "auto curve selection не нашёл все refs для swap.",
    });
  }
  return enriched;
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

  if (["irs", "ois", "xccy", "basis"].some((tag) => productLower.includes(tag))) {
    const fixedRate = Number.isFinite(price) ? price : 0;
    const riskFreeRate = fixedRate >= 0 && fixedRate <= 1 ? fixedRate : 0.05;
    const discount = Math.exp(-riskFreeRate * t);
    const denom = notional * t * discount;
    const floatRate = Math.abs(denom) > 1e-12 && Number.isFinite(mtm) ? fixedRate + mtm / quantity / denom : riskFreeRate;
    const strike = safePositive(Math.abs(fixedRate), 1e-8);
    return enrichTradePosition({
      position: {
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
      },
      product,
      instrument,
      ccy1,
      ccy2,
      sum1,
      sum2,
      startDateIso: toIsoDate(normalizeString(row["Начало"])) || valuationDateIso,
      rowLog,
      rowNum,
    });
  }

  const strike = safePositive(price, safePositive(quoteRatio, safePositive(spotCol, 1)));
  const riskFreeRate = 0.05;
  const discount = Math.exp(-riskFreeRate * t);
  const impliedUnderlying = strike + (Number.isFinite(mtm) ? mtm / quantity / (notional * discount) : 0);
  const underlying_price = safePositive(impliedUnderlying, safePositive(spotCol, strike));
  return enrichTradePosition({
    position: {
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
    },
    product,
    instrument,
    ccy1,
    ccy2,
    sum1,
    sum2,
    startDateIso: toIsoDate(normalizeString(row["Начало"])) || maturityDateIso,
    rowLog,
    rowNum,
  });
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
