import { metricsSchema, scenarioSchema } from "../contracts/metrics";
import { marketDataSessionSummarySchema } from "../contracts/marketData";
import { demoMetrics, demoPositions, demoScenarios } from "../../mock/demoData";

function delay(ms: number) {
  if (process.env.NODE_ENV === "test") {
    return Promise.resolve();
  }
  return new Promise((res) => setTimeout(res, ms));
}

export async function mockFetchMetrics() {
  await delay(300);
  return metricsSchema.parse(demoMetrics);
}

export async function mockFetchPositions() {
  await delay(200);
  return demoPositions;
}

export async function mockFetchScenarios() {
  await delay(200);
  return demoScenarios.map((s) => scenarioSchema.parse(s));
}

export async function mockFetchMarketDataSession() {
  await delay(120);
  return marketDataSessionSummarySchema.parse({
    session_id: "demo-market-session",
    files: [
      { filename: "curveDiscount.xlsx", kind: "curve_discount", size_bytes: 1024 },
      { filename: "curveForward.xlsx", kind: "curve_forward", size_bytes: 1024 },
      { filename: "fixing.xlsx", kind: "fixing", size_bytes: 1024 },
      { filename: "calibrationInstrument.xlsx", kind: "calibration", size_bytes: 1024 },
      { filename: "RC_USDRUB.xlsx", kind: "fx_history", size_bytes: 1024 },
    ],
    missing_required_files: [],
    blocking_errors: 0,
    warnings: 0,
    ready: true,
    validation_log: [],
    counts: {
      discount_curves: 1,
      forward_curves: 1,
      fixings: 1,
      calibration_instruments: 1,
      fx_history: 1,
    },
  });
}

export async function mockUploadMarketDataBundleFile(file: File) {
  await delay(120);
  const summary = await mockFetchMarketDataSession();
  return marketDataSessionSummarySchema.parse({
    ...summary,
    files: [
      ...summary.files,
      {
        filename: file.name,
        kind: "fixing",
        size_bytes: file.size,
      },
    ],
  });
}
