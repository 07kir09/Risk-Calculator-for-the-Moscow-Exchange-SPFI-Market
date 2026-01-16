import { metricsSchema, scenarioSchema } from "../contracts/metrics";
import { demoMetrics, demoPositions, demoScenarios } from "../../mock/demoData";

export async function mockFetchMetrics() {
  // эмуляция сети
  await new Promise((res) => setTimeout(res, 300));
  return metricsSchema.parse(demoMetrics);
}

export async function mockFetchPositions() {
  await new Promise((res) => setTimeout(res, 200));
  return demoPositions;
}

export async function mockFetchScenarios() {
  await new Promise((res) => setTimeout(res, 200));
  return demoScenarios.map((s) => scenarioSchema.parse(s));
}
