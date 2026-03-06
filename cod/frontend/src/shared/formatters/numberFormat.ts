const numberFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number | null | undefined, currency = "RUB"): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${numberFormatter.format(value)} ${currency}`;
}

export function formatNumber(value: number | null | undefined, fractionDigits = 4): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: Math.min(2, fractionDigits),
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercentFromDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

export function parsePercentToDecimal(input: string): number {
  const normalized = input.replace("%", "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

export function formatNullable(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}
