import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchDefaultLimits, fetchDefaultScenarios, fetchHealth, runMetricsCalculation } from "./riskApi";
import { MetricsRequest } from "../types/contracts";

export function useHealthQuery() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 20_000,
  });
}

export function useDefaultLimitsQuery(enabled = true) {
  return useQuery({
    queryKey: ["default-limits"],
    queryFn: fetchDefaultLimits,
    enabled,
  });
}

export function useDefaultScenariosQuery(enabled = true) {
  return useQuery({
    queryKey: ["default-scenarios"],
    queryFn: fetchDefaultScenarios,
    enabled,
  });
}

export function useCalculateMutation() {
  return useMutation({
    mutationKey: ["calculate-metrics"],
    mutationFn: (payload: MetricsRequest) => runMetricsCalculation(payload),
  });
}
