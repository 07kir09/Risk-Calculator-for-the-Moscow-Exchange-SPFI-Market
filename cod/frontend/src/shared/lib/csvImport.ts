import { PositionDraft } from "../types/contracts";

export type CsvRow = Record<string, string>;
export type CsvColumnMapping = Partial<Record<keyof PositionDraft, string>>;

const FIELD_ALIASES: Partial<Record<keyof PositionDraft, string[]>> = {
  position_id: [
    "position id",
    "trade id",
    "ticket",
    "id",
    "номер в торговой системе",
    "номер в клиринговой системе",
    "номер сделки",
  ],
  instrument_type: ["instrument type", "type", "product", "продукт", "тип инструмента"],
  option_type: ["option type", "put call", "тип опциона", "опцион"],
  style: ["style", "exercise style", "американский", "европейский"],
  quantity: ["quantity", "qty", "количество", "сумма 1", "объем"],
  notional: ["notional", "nominal", "сумма", "стоимость", "value"],
  underlying_symbol: ["underlying", "symbol", "ticker", "инструмент", "базовый актив", "тикер"],
  underlying_price: ["underlying price", "price", "spot", "цена", "котировка"],
  strike: ["strike", "strike price", "страйк"],
  volatility: ["volatility", "vol", "sigma", "волатильность"],
  maturity_date: ["maturity date", "expiry", "end date", "окончание", "дата окончания"],
  valuation_date: ["valuation date", "start date", "trade date", "начало", "дата регистрации", "дата сделки"],
  risk_free_rate: ["risk free rate", "risk free", "rfr", "ставка", "key rate", "безрисковая ставка", "курс"],
  dividend_yield: ["dividend", "dividend yield", "дивиденд", "дивидендная доходность"],
  currency: ["currency", "ccy", "валюта", "валюта 1"],
  liquidity_haircut: ["liquidity haircut", "haircut", "ликвидность", "ликвидностный дисконт"],
  model: ["model", "pricing model", "модель"],
  fixed_rate: ["fixed rate", "фиксированная ставка"],
  float_rate: ["float rate", "floating rate", "плавающая ставка"],
  day_count: ["day count", "daycount", "база дней", "дней"],
};

function normalizeToken(value: string): string {
  return value
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[%]/g, " pct ")
    .replace(/[№]/g, " номер ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCell(value: string | undefined): string {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\uFEFF/g, "").trim();
}

function looksLikeSell(directionRaw: string): boolean {
  const direction = normalizeToken(directionRaw);
  if (!direction) return false;
  const hasBuy = direction.includes("buy") || direction.includes("куп");
  const hasSell = direction.includes("sell") || direction.includes("прод");
  if (hasBuy && hasSell) return false;
  return hasSell || direction.includes("pay fixed");
}

function looksLikeBuy(directionRaw: string): boolean {
  const direction = normalizeToken(directionRaw);
  if (!direction) return false;
  const hasBuy = direction.includes("buy") || direction.includes("куп");
  const hasSell = direction.includes("sell") || direction.includes("прод");
  if (hasBuy && hasSell) return false;
  return hasBuy || direction.includes("receive fixed");
}

function parseNumericCore(raw: string): number | undefined {
  let value = raw.replace(/[\u00A0\u202F\s']/g, "");
  if (!value) return undefined;
  const hasBrackets = value.startsWith("(") && value.endsWith(")");
  if (hasBrackets) {
    value = `-${value.slice(1, -1)}`;
  }
  if (value.endsWith("-")) {
    value = `-${value.slice(0, -1)}`;
  }

  const commaIndex = value.lastIndexOf(",");
  const dotIndex = value.lastIndexOf(".");
  if (commaIndex >= 0 && dotIndex >= 0) {
    if (commaIndex > dotIndex) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else if (commaIndex >= 0) {
    value = value.replace(",", ".");
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRate(raw: string | undefined): number | undefined {
  const parsed = parseCsvNumber(raw);
  if (parsed === undefined) return undefined;
  const abs = Math.abs(parsed);
  if (abs > 1 && abs <= 100) return parsed / 100;
  return parsed;
}

function buildIsoDate(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

function parseDateParts(raw: string): { year: number; month: number; day: number } | undefined {
  let matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t].*)?$/i);
  if (matched) {
    return { year: Number(matched[1]), month: Number(matched[2]), day: Number(matched[3]) };
  }

  matched = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:[ t].*)?$/i);
  if (matched) {
    const day = Number(matched[1]);
    const month = Number(matched[2]);
    const year = Number(matched[3].length === 2 ? `20${matched[3]}` : matched[3]);
    return { year, month, day };
  }

  matched = raw.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})(?:[ t].*)?$/i);
  if (matched) {
    return { year: Number(matched[1]), month: Number(matched[2]), day: Number(matched[3]) };
  }

  matched = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (matched) {
    return { year: Number(matched[1]), month: Number(matched[2]), day: Number(matched[3]) };
  }

  return undefined;
}

function parseExcelSerialDate(raw: string): string | undefined {
  if (!/^\d+([.,]\d+)?$/.test(raw)) return undefined;
  const serial = parseNumericCore(raw);
  if (serial === undefined) return undefined;
  if (serial < 1 || serial > 200000) return undefined;
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.floor(serial) * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function applyTenorToDate(rawTenor: string, referenceIsoDate: string): string | undefined {
  const base = new Date(`${referenceIsoDate}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return undefined;

  const matched = rawTenor.trim().match(/^(\d{1,4})\s*([dDwWmMyYдДнНмМгГ])$/);
  if (!matched) return undefined;

  const value = Number(matched[1]);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const unit = matched[2].toLowerCase();

  if (unit === "d" || unit === "д") {
    base.setUTCDate(base.getUTCDate() + value);
    return base.toISOString().slice(0, 10);
  }
  if (unit === "w" || unit === "н") {
    base.setUTCDate(base.getUTCDate() + value * 7);
    return base.toISOString().slice(0, 10);
  }
  if (unit === "m" || unit === "м") {
    base.setUTCMonth(base.getUTCMonth() + value);
    return base.toISOString().slice(0, 10);
  }
  if (unit === "y" || unit === "г") {
    base.setUTCFullYear(base.getUTCFullYear() + value);
    return base.toISOString().slice(0, 10);
  }

  return undefined;
}

function parseFlexibleDate(raw: string | undefined, referenceDate?: string): string | undefined {
  const source = sanitizeCell(raw)
    .replace(/^"+|"+$/g, "")
    .trim();
  if (!source) return undefined;

  const excelDate = parseExcelSerialDate(source);
  if (excelDate) {
    return excelDate;
  }

  const parts = parseDateParts(source);
  if (parts) {
    return buildIsoDate(parts.year, parts.month, parts.day);
  }

  const fromTimestamp = Date.parse(source);
  if (Number.isFinite(fromTimestamp)) {
    return new Date(fromTimestamp).toISOString().slice(0, 10);
  }

  const normalizedReference = referenceDate ? parseFlexibleDate(referenceDate) : undefined;
  if (normalizedReference) {
    const tenorDate = applyTenorToDate(source, normalizedReference);
    if (tenorDate) {
      return tenorDate;
    }
  }

  return undefined;
}

function normalizeDate(raw: string | undefined, referenceDate?: string): string {
  const source = sanitizeCell(raw);
  if (!source) return "";

  const parsed = parseFlexibleDate(source, referenceDate);
  if (parsed) {
    return parsed;
  }

  return source;
}

function normalizeCurrency(raw: string | undefined): string {
  const source = sanitizeCell(raw).toUpperCase();
  const matched = source.match(/[A-Z]{3}/);
  return matched ? matched[0] : "RUB";
}

function inferInstrumentType(raw: string | undefined, product: string | undefined, symbol: string | undefined, strike?: number): PositionDraft["instrument_type"] {
  const source = `${sanitizeCell(raw)} ${sanitizeCell(product)} ${sanitizeCell(symbol)}`;
  const token = normalizeToken(source);

  if (token.includes("cap") || token.includes("floor") || token.includes("option") || token.includes("опцион")) {
    return "option";
  }
  if (token.includes("swap") || token.includes("irs") || token.includes("ois") || token.includes("xccy") || token.includes("своп")) {
    return "swap_ir";
  }
  if (token.includes("forward") || token.includes("fwd") || token.includes("ndf") || token.includes("форвард")) {
    return "forward";
  }
  if (strike !== undefined && strike > 0) {
    return "option";
  }
  return "forward";
}

function inferOptionType(raw: string | undefined, product: string | undefined): PositionDraft["option_type"] {
  const token = normalizeToken(`${sanitizeCell(raw)} ${sanitizeCell(product)}`);
  if (token.includes("put") || token.includes("floor")) return "put";
  return "call";
}

function inferStyle(raw: string | undefined): PositionDraft["style"] {
  const token = normalizeToken(sanitizeCell(raw));
  if (token.includes("american") || token.includes("американ")) return "american";
  return "european";
}

function findValueByAliases(rowEntries: Array<{ key: string; normalizedKey: string; value: string }>, aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map(normalizeToken).filter(Boolean);
  for (const alias of normalizedAliases) {
    const exact = rowEntries.find((entry) => entry.normalizedKey === alias && entry.value);
    if (exact) return exact.value;
  }
  for (const alias of normalizedAliases) {
    const partial = rowEntries.find(
      (entry) => entry.value && (entry.normalizedKey.includes(alias) || alias.includes(entry.normalizedKey))
    );
    if (partial) return partial.value;
  }
  return undefined;
}

export function sanitizeCsvHeader(header: string): string {
  return sanitizeCell(header);
}

export function parseCsvNumber(raw: string | undefined): number | undefined {
  const source = sanitizeCell(raw);
  if (!source || source === "-" || source === "—") return undefined;

  const isPercent = source.endsWith("%");
  const withoutPercent = isPercent ? source.slice(0, -1) : source;
  const parsed = parseNumericCore(withoutPercent);
  if (parsed === undefined) return undefined;
  return isPercent ? parsed / 100 : parsed;
}

export function suggestColumnMapping(columns: string[], targets: Array<keyof PositionDraft>): CsvColumnMapping {
  const mapping: CsvColumnMapping = {};
  const usedColumns = new Set<string>();
  const normalizedColumns = columns.map((column) => ({ raw: column, normalized: normalizeToken(column) }));

  for (const target of targets) {
    const aliases = [target, ...(FIELD_ALIASES[target] ?? [])].map((item) => normalizeToken(item)).filter(Boolean);

    let candidate = normalizedColumns.find(
      (column) => !usedColumns.has(column.raw) && aliases.includes(column.normalized)
    );

    if (!candidate) {
      candidate = normalizedColumns.find(
        (column) =>
          !usedColumns.has(column.raw) &&
          aliases.some((alias) => alias && (column.normalized.includes(alias) || alias.includes(column.normalized)))
      );
    }

    if (candidate) {
      mapping[target] = candidate.raw;
      usedColumns.add(candidate.raw);
    }
  }

  return mapping;
}

export function mapCsvRowToPosition(row: CsvRow, mapping: CsvColumnMapping, rowIndex: number): PositionDraft {
  const rowEntries = Object.entries(row).map(([key, value]) => ({
    key,
    normalizedKey: normalizeToken(key),
    value: sanitizeCell(value),
  }));

  function readValue(target: keyof PositionDraft, extraAliases: string[] = []): string | undefined {
    const mappedColumn = mapping[target];
    if (mappedColumn) {
      const mappedRaw = sanitizeCell(row[mappedColumn]);
      return mappedRaw || undefined;
    }
    return findValueByAliases(rowEntries, [target, ...(FIELD_ALIASES[target] ?? []), ...extraAliases]);
  }

  const product = readValue("instrument_type", ["product", "продукт"]);
  const symbol = readValue("underlying_symbol", ["instrument", "инструмент"]);
  const strikeRaw = parseCsvNumber(readValue("strike"));
  const instrumentType = inferInstrumentType(readValue("instrument_type"), product, symbol, strikeRaw);
  const optionType = inferOptionType(readValue("option_type"), product);
  const style = inferStyle(readValue("style"));

  const quantityBase = parseCsvNumber(readValue("quantity")) ?? parseCsvNumber(readValue("notional")) ?? 0;
  const directionRaw = readValue("model", ["direction", "направление"]);
  const quantity =
    looksLikeSell(directionRaw ?? "") ? -Math.abs(quantityBase) : looksLikeBuy(directionRaw ?? "") ? Math.abs(quantityBase) : quantityBase;

  const parsedNotional = parseCsvNumber(readValue("notional"));
  const notional = parsedNotional === undefined ? undefined : Math.abs(parsedNotional);
  let underlyingPrice = parseCsvNumber(readValue("underlying_price", ["price", "цена"])) ?? 0;
  let strike = strikeRaw ?? 0;
  if (instrumentType === "option" && strike <= 0) {
    strike = underlyingPrice > 0 ? underlyingPrice : 0;
  }
  if (strike <= 0 && underlyingPrice > 0) {
    strike = underlyingPrice;
  }
  if (underlyingPrice <= 0 && strike > 0) {
    underlyingPrice = strike;
  }
  if (underlyingPrice <= 0 && notional !== undefined && quantityBase !== 0) {
    underlyingPrice = Math.abs(notional / quantityBase);
  }

  const volatilityRaw = parseRate(readValue("volatility"));
  const volatility = instrumentType === "option" ? (volatilityRaw ?? 0.2) : volatilityRaw;
  let valuationDate = normalizeDate(readValue("valuation_date", ["дата регистрации", "trade date", "дата сделки", "start date", "начало"]));
  let maturityDate = normalizeDate(readValue("maturity_date", ["end date", "окончание", "дата окончания"]), valuationDate);

  const maturityLooksLikeIso = /^\d{4}-\d{2}-\d{2}$/.test(maturityDate);
  if (!maturityLooksLikeIso) {
    const tenorRaw = findValueByAliases(rowEntries, ["tenor", "term", "срок"]);
    const maturityFromTenor = normalizeDate(tenorRaw, valuationDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(maturityFromTenor)) {
      maturityDate = maturityFromTenor;
    }
  }

  const valuationFromRegistration = normalizeDate(findValueByAliases(rowEntries, ["дата регистрации", "trade date", "дата сделки"]));
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(valuationFromRegistration) &&
    /^\d{4}-\d{2}-\d{2}$/.test(maturityDate) &&
    Date.parse(maturityDate) <= Date.parse(valuationDate) &&
    Date.parse(valuationFromRegistration) < Date.parse(maturityDate)
  ) {
    valuationDate = valuationFromRegistration;
  }

  const parsedHaircut = parseRate(readValue("liquidity_haircut"));
  const liquidityHaircut = parsedHaircut === undefined ? undefined : Math.max(parsedHaircut, 0);

  return {
    position_id: readValue("position_id") || `pos_${rowIndex + 1}`,
    instrument_type: instrumentType,
    option_type: optionType,
    style,
    quantity,
    notional,
    underlying_symbol: symbol || readValue("position_id") || `asset_${rowIndex + 1}`,
    underlying_price: underlyingPrice,
    strike,
    volatility,
    maturity_date: maturityDate,
    valuation_date: valuationDate,
    risk_free_rate: parseRate(readValue("risk_free_rate", ["rate", "ставка", "курс"])) ?? 0,
    dividend_yield: parseRate(readValue("dividend_yield")),
    currency: normalizeCurrency(readValue("currency", ["валюта 1"])),
    liquidity_haircut: liquidityHaircut,
    model: readValue("model") || null,
    fixed_rate: parseRate(readValue("fixed_rate")) ?? null,
    float_rate: parseRate(readValue("float_rate")) ?? null,
    day_count: parseCsvNumber(readValue("day_count")) ?? null,
  };
}
