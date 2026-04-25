import { metricsSchema } from "../api/contracts/metrics";

const minimalMetrics = {
  base_value: null,
  correlations: null,
  limits: [["var_hist", 120, 100, true]],
  top_contributors: {
    var_hist: [
      {
        metric: "var_hist",
        position_id: "p1",
        scenario_id: "s1",
        pnl_contribution: -120,
        abs_pnl_contribution: 120,
      },
    ],
  },
  validation_log: [
    {
      severity: "WARNING",
      message: "correlations skipped",
      row: null,
      field: null,
    },
  ],
  config: null,
  worst_stress: null,
  limit_source: "draft_auto",
  methodology_metadata: {
    methodology_status: "preliminary",
    limit_source: "draft_auto",
    preliminary: true,
    draft_policy_note: "Авто-пороги используются для предварительного контроля.",
    var_method: "scenario_quantile",
    scenario_count: 2,
    stress_source: "backend_calculated",
    backend_calculated: true,
    export_generated_at: null,
  },
  calculation_status: "complete",
  data_quality: {
    market_data_completeness: "complete",
    missing_curves: [],
    missing_fx: [],
    affected_positions: [],
    partial_positions_count: 0,
    warnings: [],
  },
  market_data_completeness: "complete",
  market_data_source: "market_data_session",
  methodology_status: "production_inputs",
  valuation_label: "Net PV / MtM",
  var_method: "scenario_quantile",
};

describe("metrics contract", () => {
  test("strictly parses nullable base value and synced contract fields", () => {
    const parsed = metricsSchema.parse(minimalMetrics);

    expect(parsed.base_value).toBeNull();
    expect(parsed.validation_log[0].severity).toBe("WARNING");
    expect(parsed.limits?.[0]).toEqual(["var_hist", 120, 100, true]);
    expect(parsed.top_contributors?.var_hist[0].position_id).toBe("p1");
    expect(parsed.limit_source).toBe("draft_auto");
    expect(parsed.methodology_metadata?.preliminary).toBe(true);
    expect(parsed.calculation_status).toBe("complete");
    expect(parsed.data_quality.market_data_completeness).toBe("complete");
    expect(parsed.valuation_label).toBe("Net PV / MtM");
  });

  test("rejects unknown response fields", () => {
    const result = metricsSchema.safeParse({
      ...minimalMetrics,
      unexpected_field: true,
    });

    expect(result.success).toBe(false);
  });

  test("rejects severity outside the backend enum", () => {
    const result = metricsSchema.safeParse({
      ...minimalMetrics,
      validation_log: [{ severity: "warn", message: "bad casing" }],
    });

    expect(result.success).toBe(false);
  });
});
