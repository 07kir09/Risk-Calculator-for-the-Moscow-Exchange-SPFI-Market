import { z } from "zod";

export const marketDataValidationSchema = z.object({
  severity: z.enum(["INFO", "WARNING", "ERROR"]),
  message: z.string(),
  row: z.number().nullable().optional(),
  field: z.string().nullable().optional(),
});

export const uploadedMarketDataFileSchema = z.object({
  filename: z.string(),
  kind: z.enum(["curve_discount", "curve_forward", "fixing", "calibration", "fx_history"]),
  size_bytes: z.number().int().nonnegative(),
});

export const marketDataSessionSummarySchema = z.object({
  session_id: z.string(),
  files: z.array(uploadedMarketDataFileSchema),
  missing_required_files: z.array(z.string()),
  blocking_errors: z.number().int().nonnegative(),
  warnings: z.number().int().nonnegative(),
  ready: z.boolean(),
  validation_log: z.array(marketDataValidationSchema),
  counts: z.record(z.number().int().nonnegative()),
});

export type MarketDataSessionSummary = z.infer<typeof marketDataSessionSummarySchema>;
export type UploadedMarketDataFile = z.infer<typeof uploadedMarketDataFileSchema>;
