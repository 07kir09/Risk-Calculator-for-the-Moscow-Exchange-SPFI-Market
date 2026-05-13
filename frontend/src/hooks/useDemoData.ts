import { useQuery } from "@tanstack/react-query";
import { mockFetchMetrics, mockFetchPositions, mockFetchScenarios } from "../api/services/mock";

export function useDemoMetrics() {
  return useQuery({ queryKey: ["demo-metrics"], queryFn: mockFetchMetrics, staleTime: 60_000 });
}

export function useDemoPositions() {
  return useQuery({ queryKey: ["demo-positions"], queryFn: mockFetchPositions, staleTime: 60_000 });
}

export function useDemoScenarios() {
  return useQuery({ queryKey: ["demo-scenarios"], queryFn: mockFetchScenarios, staleTime: 60_000 });
}

