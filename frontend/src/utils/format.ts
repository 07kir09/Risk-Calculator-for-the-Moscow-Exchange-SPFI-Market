export function formatNumber(value?: number, digits = 2) {
  if (value === undefined || value === null) return "—";
  return value.toLocaleString("ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

