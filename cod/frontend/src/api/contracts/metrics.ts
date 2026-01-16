import { z } from "zod";

const n = () => z.number();
const nOpt = () => z.number().nullable().optional();
const arrOpt = <T extends z.ZodTypeAny>(item: T) => z.array(item).nullable().optional();

export const scenarioSchema = z.object({
  scenario_id: z.string(),
  underlying_shift: z.number(),
  volatility_shift: z.number(),
  rate_shift: z.number(),
  description: z.string().optional(),
});

export const metricsSchema = z.object({
  base_value: z.number(),
  var_hist: nOpt(),
  es_hist: nOpt(),
  var_param: nOpt(),
  es_param: nOpt(),
  lc_var: nOpt(),
  greeks: z.record(n()).nullable().optional(),
  stress: arrOpt(
    z.object({
    scenario_id: z.string(),
    pnl: z.number(),
    limit: nOpt(),
    breached: z.boolean(),
  })
  ),
  limits: arrOpt(z.tuple([z.string(), z.number(), z.number(), z.boolean()])),
  correlations: arrOpt(z.array(n())),
  pnl_matrix: arrOpt(z.array(n())),
  buckets: z.record(z.record(n())).nullable().optional(),
  capital: nOpt(),
  initial_margin: nOpt(),
  variation_margin: nOpt(),
});

export type MetricsResponse = z.infer<typeof metricsSchema>;
export type ScenarioDTO = z.infer<typeof scenarioSchema>;
