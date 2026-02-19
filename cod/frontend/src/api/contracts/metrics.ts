import { z } from "zod";

const n = () => z.number();
const nOpt = () => z.number().nullable().optional();
const arrOpt = <T extends z.ZodTypeAny>(item: T) => z.array(item).nullable().optional();

const lcBreakdownRowSchema = z.object({
  position_id: z.string(),
  model: z.string(),
  quantity: z.number(),
  position_value: z.number(),
  haircut_input: z.number(),
  add_on_money: z.number(),
});

const contributorRowSchema = z.object({
  metric: z.string().optional(),
  position_id: z.string(),
  scenario_id: z.string().optional(),
  pnl_contribution: z.number(),
  abs_pnl_contribution: z.number(),
});

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
  lc_var_addon: nOpt(),
  lc_var_breakdown: arrOpt(lcBreakdownRowSchema),
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
  pnl_distribution: arrOpt(n()),
  top_contributors: z.record(z.array(contributorRowSchema)).nullable().optional(),
  buckets: z.record(z.record(n())).nullable().optional(),
  base_currency: z.string().optional(),
  confidence_level: nOpt(),
  horizon_days: z.number().int().nullable().optional(),
  mode: z.string().optional(),
  methodology_note: z.string().nullable().optional(),
  fx_warning: z.string().nullable().optional(),
  liquidity_model: z.string().optional(),
  capital: nOpt(),
  initial_margin: nOpt(),
  variation_margin: nOpt(),
});

export type MetricsResponse = z.infer<typeof metricsSchema>;
export type ScenarioDTO = z.infer<typeof scenarioSchema>;
