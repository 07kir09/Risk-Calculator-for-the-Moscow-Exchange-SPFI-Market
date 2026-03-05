import { parsePortfolioCsv } from "../validation/portfolioCsv";

const header =
  "instrument_type,position_id,quantity,notional,underlying_symbol,currency,underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,option_type,style,dividend_yield,liquidity_haircut,fixed_rate,float_rate,day_count";

function csv(lines: string[]) {
  return [header, ...lines].join("\n");
}

test("accepts case-insensitive instrument_type and normalizes values", () => {
  const { positions, log } = parsePortfolioCsv(
    csv([
      "OPTION,pos1,1,1,MOEX,RUB,100,95,0.2,2026-12-31,2026-01-01,0.05,CALL,EUROPEAN,,,,,",
    ])
  );

  expect(log.filter((x) => x.severity === "ERROR")).toHaveLength(0);
  expect(positions).toHaveLength(1);
  expect(positions[0].instrument_type).toBe("option");
  expect(positions[0].option_type).toBe("call");
  expect(positions[0].style).toBe("european");
});

test("rejects invalid option_type/style even for non-option instruments", () => {
  const { positions, log } = parsePortfolioCsv(
    csv([
      "forward,fwd_bad,1,1,USDRUB,RUB,100,100,0.0,2026-12-31,2026-01-01,0.05,bad_style,bad_style,,,,,",
    ])
  );

  expect(positions).toHaveLength(0);
  expect(log.some((x) => x.field === "option_type" && x.severity === "ERROR")).toBe(true);
  expect(log.some((x) => x.field === "style" && x.severity === "ERROR")).toBe(true);
});

test("rejects risk_free_rate below -1", () => {
  const { positions, log } = parsePortfolioCsv(
    csv([
      "option,rate_bad,1,1,MOEX,RUB,100,95,0.2,2026-12-31,2026-01-01,-1.5,call,european,,,,,",
    ])
  );

  expect(positions).toHaveLength(0);
  expect(log.some((x) => x.field === "risk_free_rate" && x.severity === "ERROR")).toBe(true);
});

test("rejects invalid optional numeric fields and negative limits", () => {
  const { positions, log } = parsePortfolioCsv(
    csv([
      "option,opt_bad_optional,1,1,MOEX,RUB,100,95,0.2,2026-12-31,2026-01-01,0.05,call,european,-0.1,-0.2,abc,def,ghi",
    ])
  );

  expect(positions).toHaveLength(0);
  expect(log.some((x) => x.field === "dividend_yield" && x.severity === "ERROR")).toBe(true);
  expect(log.some((x) => x.field === "liquidity_haircut" && x.severity === "ERROR")).toBe(true);
  expect(log.some((x) => x.field === "fixed_rate" && x.severity === "ERROR")).toBe(true);
  expect(log.some((x) => x.field === "float_rate" && x.severity === "ERROR")).toBe(true);
  expect(log.some((x) => x.field === "day_count" && x.severity === "ERROR")).toBe(true);
});

test("rejects non-positive day_count for swap_ir", () => {
  const { positions, log } = parsePortfolioCsv(
    csv([
      "swap_ir,swap_bad,1,1,RUONIA,RUB,100,95,0.0,2026-12-31,2026-01-01,0.05,call,european,,,,,0",
    ])
  );

  expect(positions).toHaveLength(0);
  expect(log.some((x) => x.field === "day_count" && x.message.includes("swap_ir"))).toBe(true);
});

test("keeps valid optional numeric fields", () => {
  const { positions, log } = parsePortfolioCsv(
    csv([
      "swap_ir,swap_ok,1,1,RUONIA,RUB,100,95,0.0,2026-12-31,2026-01-01,0.05,call,european,0.01,0.02,0.03,0.04,0.5",
    ])
  );

  expect(log.filter((x) => x.severity === "ERROR")).toHaveLength(0);
  expect(positions).toHaveLength(1);
  expect(positions[0].dividend_yield).toBeCloseTo(0.01);
  expect(positions[0].liquidity_haircut).toBeCloseTo(0.02);
  expect(positions[0].fixed_rate).toBeCloseTo(0.03);
  expect(positions[0].float_rate).toBeCloseTo(0.04);
  expect(positions[0].day_count).toBeCloseTo(0.5);
});
