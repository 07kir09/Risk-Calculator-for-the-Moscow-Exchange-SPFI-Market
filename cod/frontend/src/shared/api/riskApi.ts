import { endpoints } from "./endpoints";
import { apiRequest } from "./apiClient";
import { MetricsRequest, MetricsResponse, RequestMeta, ScenarioDraft } from "../types/contracts";

let activeMetricsController: AbortController | null = null;

export async function fetchHealth() {
  return apiRequest<{ status: string }>(endpoints.health);
}

export async function fetchDefaultLimits() {
  return apiRequest<Record<string, any>>(endpoints.limits);
}

export async function fetchDefaultScenarios() {
  return apiRequest<ScenarioDraft[]>(endpoints.scenarios);
}

export async function runMetricsCalculation(
  payload: MetricsRequest,
  timeoutMs = 45_000
): Promise<{ data: MetricsResponse; meta: RequestMeta }> {
  if (activeMetricsController) {
    activeMetricsController.abort();
  }
  const controller = new AbortController();
  activeMetricsController = controller;

  try {
    return await apiRequest<MetricsResponse>(endpoints.metrics, {
      method: "POST",
      body: payload,
      signal: controller.signal,
      timeoutMs,
    });
  } finally {
    if (activeMetricsController === controller) {
      activeMetricsController = null;
    }
  }
}
