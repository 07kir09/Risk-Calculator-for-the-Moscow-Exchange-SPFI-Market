import client from "./client";
import { PositionDTO } from "./types";
import { metricsSchema, scenarioSchema } from "./contracts/metrics";
import { z } from "zod";

export async function fetchMetrics(payload: {
  positions: PositionDTO[];
  scenarios: z.infer<typeof scenarioSchema>[];
  limits?: Record<string, unknown>;
  alpha?: number;
  calc_sensitivities?: boolean;
  calc_var_es?: boolean;
  calc_stress?: boolean;
  calc_margin_capital?: boolean;
}) {
  const { data } = await client.post("/metrics", payload);
  return metricsSchema.parse(data);
}

export async function fetchLimits() {
  const { data } = await client.get("/limits");
  return data;
}

export async function fetchScenarioCatalog() {
  const { data } = await client.get("/scenarios");
  const arr = z.array(scenarioSchema);
  return arr.parse(data);
}
