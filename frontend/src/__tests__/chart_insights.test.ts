import {
  buildContributorInsights,
  buildLimitOverviewInsights,
  buildStressInsights,
} from "../lib/chartInsights";

test("stress insights reflect breaches and worst scenario", () => {
  const insights = buildStressInsights({
    stressRows: [
      { scenario_id: "base", pnl: 100, limit: 50, breached: true },
      { scenario_id: "shock_down", pnl: -200, limit: 50, breached: true },
      { scenario_id: "upside", pnl: 80, limit: 50, breached: false },
    ],
    scenarioCount: 3,
    baseCurrency: "RUB",
  });

  expect(insights[0].text).toContain("shock_down");
  expect(insights[1].text).toContain("2 из 3");
});

test("limit insights highlight the nearest threshold", () => {
  const insights = buildLimitOverviewInsights({
    limits: [
      ["var_hist", 90, 100, false],
      ["lc_var", 110, 100, true],
    ],
    overallUtilization: 110,
  });

  expect(insights[0].text).toContain("110");
  expect(insights[1].text).toContain("LC VaR");
  expect(insights[2].text).toContain("1 из 2");
});

test("contributor insights quantify concentration", () => {
  const insights = buildContributorInsights({
    contributors: [
      { position_id: "p1", metric: "var_hist", pnl_contribution: -120, abs_pnl_contribution: 120 },
      { position_id: "p2", metric: "var_hist", pnl_contribution: -80, abs_pnl_contribution: 80 },
      { position_id: "p3", metric: "stress", pnl_contribution: -20, abs_pnl_contribution: 20 },
    ],
  });

  expect(insights[0].text).toContain("p1");
  expect(insights[1].text).toContain("топ-3");
  expect(insights[2].text).toContain("%");
});
