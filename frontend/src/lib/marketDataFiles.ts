export type MarketDataFileKind = "curve_discount" | "curve_forward" | "fixing" | "calibration" | "fx_history";

export function classifyMarketDataFilename(filename: string): MarketDataFileKind | null {
  const lower = filename.trim().toLowerCase();
  if (lower === "curvediscount.xlsx" || lower === "curvediscount.xls") return "curve_discount";
  if (lower === "curveforward.xlsx" || lower === "curveforward.xls") return "curve_forward";
  if (lower === "fixing.xlsx" || lower === "fixing.xls") return "fixing";
  if (lower.startsWith("calibrationinstrument") && (lower.endsWith(".xlsx") || lower.endsWith(".xls"))) return "calibration";
  if (lower.startsWith("rc_") && (lower.endsWith(".xlsx") || lower.endsWith(".xls"))) return "fx_history";
  return null;
}

export function isMarketDataBundleFile(filename: string): boolean {
  return classifyMarketDataFilename(filename) !== null;
}
