import { z } from "zod";

const n = () => z.number();
const nOpt = () => z.number().nullable().optional();
const arrOpt = <T extends z.ZodTypeAny>(item: T) => z.array(item).nullable().optional();

const validationLogEntrySchema = z.object({
  severity: z.enum(["INFO", "WARNING", "ERROR"]),
  message: z.string(),
  row: z.number().int().nullable().optional(),
  field: z.string().nullable().optional(),
}).strict();

const lcBreakdownRowSchema = z.object({
  position_id: z.string(),
  model: z.string(),
  quantity: z.number(),
  position_value: z.number(),
  haircut_input: z.number(),
  add_on_money: z.number(),
}).strict();

const contributorRowSchema = z.object({
  metric: z.string().optional(),
  position_id: z.string(),
  scenario_id: z.string().optional(),
  pnl_contribution: z.number(),
  abs_pnl_contribution: z.number(),
}).strict();

export const limitSourceSchema = z.enum(["draft_auto", "manual_user", "manual_approved", "demo_default"]);

const methodologyMetadataSchema = z.object({
  methodology_status: z.string(),
  limit_source: limitSourceSchema,
  preliminary: z.boolean(),
  draft_policy_note: z.string().nullable().optional(),
  var_method: z.string(),
  scenario_count: z.number().int().nonnegative(),
  stress_source: z.string(),
  backend_calculated: z.boolean(),
  export_generated_at: z.string().nullable().optional(),
}).strict();

const dataQualitySchema = z.object({
  market_data_completeness: z.enum(["complete", "incomplete"]).default("complete"),
  missing_curves: z.array(z.string()).default([]),
  missing_fx: z.array(z.string()).default([]),
  affected_positions: z.array(z.string()).default([]),
  partial_positions_count: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
}).strict();

export const scenarioSchema = z.object({
  scenario_id: z.string(),
  underlying_shift: z.number(),
  volatility_shift: z.number(),
  rate_shift: z.number(),
  curve_shifts: z.record(z.number()).nullable().optional(),
  fx_spot_shifts: z.record(z.number()).nullable().optional(),
  probability: z.number().nonnegative().nullable().optional(),
  description: z.string().optional(),
}).strict();

export const metricsSchema = z.object({
  base_value: z.number().nullable(),
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
    }).strict()
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
  parametric_tail_model: z.string().optional(),
  mode: z.string().optional(),
  methodology_note: z.string().nullable().optional(),
  methodology_metadata: methodologyMetadataSchema.nullable().optional(),
  limit_source: limitSourceSchema.optional(),
  fx_warning: z.string().nullable().optional(),
  liquidity_model: z.string().optional(),
  config: z.record(z.unknown()).nullable().optional(),
  worst_stress: nOpt(),
  capital: nOpt(),
  initial_margin: nOpt(),
  variation_margin: nOpt(),
  calculation_status: z.enum(["complete"]).optional().default("complete"),
  data_quality: dataQualitySchema.optional().default({
    market_data_completeness: "complete",
    missing_curves: [],
    missing_fx: [],
    affected_positions: [],
    partial_positions_count: 0,
    warnings: [],
  }),
  market_data_completeness: z.enum(["complete", "incomplete"]).optional().default("complete"),
  market_data_source: z.string().nullable().optional(),
  methodology_status: z.string().nullable().optional(),
  valuation_label: z.string().optional().default("Net PV / MtM"),
  var_method: z.string().optional().default("scenario_quantile"),
  validation_log: z.array(validationLogEntrySchema).nullable().optional().transform((value) => value ?? []),
}).strict();

export type MetricsResponse = z.infer<typeof metricsSchema>;
export type ScenarioDTO = z.infer<typeof scenarioSchema>;
export type LimitSourceDTO = z.infer<typeof limitSourceSchema>;
