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

test("parses russian trade-export format without critical errors", () => {
  const tradeCsv = [
    "Номер в клиринговой системе,Номер в торговой системе,Дата регистрации,Продукт,Инструмент,Направление,Цена,Стоимость,Курс,Начало,Окончание,Сумма 1,Валюта 1,Сумма 2,Валюта 2,Страйк",
    "6150,6150,05.03.2026,FX Fwd,FX Fwd EUR/RUB 2W,Sell,91.921,594884.96,,19.03.2026,19.03.2026,1000000,EUR,91921000,RUB,",
    "4457,4457,13.02.2026,IRS,IRS TOD/2Y RUB KeyRate,Pay Fixed,0.17,-14791.7,,13.02.2026,12.02.2028,1000000,RUB,1000000,RUB,",
    "4449,4449,11.02.2026,Cap,Cap TOM/3M RUB KeyRate R 16.5,Pay Fixed,0.012,21888.38,,12.02.2026,12.05.2026,50000000,RUB,50000000,RUB,0.165",
  ].join("\n");

  const { positions, log } = parsePortfolioCsv(tradeCsv);
  expect(log.filter((x) => x.severity === "ERROR")).toHaveLength(0);
  expect(positions).toHaveLength(3);
  expect(positions[0].instrument_type).toBe("forward");
  expect(positions[0].receive_currency).toBe("EUR");
  expect(positions[0].pay_currency).toBe("RUB");
  expect(positions[0].collateral_currency).toBe("RUB");
  expect(positions[0].receive_discount_curve_ref).toBe("EUR-DISCOUNT-RUB-CSA");
  expect(positions[0].pay_discount_curve_ref).toBe("RUB-DISCOUNT-RUB-CSA");
  expect(positions[0].pay_calendar).toBe("RUB+TARGET");
  expect(positions[1].instrument_type).toBe("swap_ir");
  expect(positions[1].collateral_currency).toBe("RUB");
  expect(positions[1].discount_curve_ref).toBe("RUB-DISCOUNT-RUB-CSA");
  expect(positions[1].projection_curve_ref).toBe("RUB-CBR-KEY-RATE");
  expect(positions[1].fixing_index_ref).toBe("RUB KeyRate");
  expect(positions[1].fixing_days_lag).toBe(0);
  expect(positions[1].business_day_convention).toBe("modified_following");
  expect(positions[2].instrument_type).toBe("option");
});

test("parses basis trade-export rows as cross-currency floating swaps", () => {
  const tradeCsv = [
    "Номер в клиринговой системе,Номер в торговой системе,Дата регистрации,Продукт,Инструмент,Направление,Цена,Стоимость,Курс,Начало,Окончание,Сумма 1,Валюта 1,Сумма 2,Валюта 2,Страйк",
    "7001,7001,05.03.2026,Basis,Basis Swap Spot/1Y. Libor USD 3m / Euribor EUR 3m,Buy,-0.0015,0,,05.03.2026,05.03.2027,1000000,USD,1200000,EUR,",
  ].join("\n");

  const { positions, log } = parsePortfolioCsv(tradeCsv);

  expect(log.filter((x) => x.severity === "ERROR")).toHaveLength(0);
  expect(positions).toHaveLength(1);
  expect(positions[0].instrument_type).toBe("swap_ir");
  expect(positions[0].pay_currency).toBe("USD");
  expect(positions[0].receive_currency).toBe("EUR");
  expect(positions[0].collateral_currency).toBe("USD");
  expect(positions[0].pay_discount_curve_ref).toBe("USD-DISCOUNT-USD-CSA");
  expect(positions[0].receive_discount_curve_ref).toBe("EUR-DISCOUNT-USD-CSA");
  expect(positions[0].pay_projection_curve_ref).toBe("USD-OISFX");
  expect(positions[0].receive_projection_curve_ref).toBe("EUR-EURIBOR-Act/365-3M");
  expect(positions[0].pay_calendar).toBe("TARGET+USD");
  expect(positions[0].receive_calendar).toBe("TARGET+USD");
  expect(positions[0].pay_fixing_calendar).toBe("USD");
  expect(positions[0].receive_fixing_calendar).toBe("TARGET");
  expect(positions[0].pay_spread).toBeCloseTo(-0.0015);
  expect(positions[0].fixed_rate).toBeNull();
  expect(positions[0].pay_fixed_rate).toBeNull();
  expect(positions[0].receive_fixed_rate).toBeNull();
  expect(positions[0].pay_fixing_days_lag).toBe(2);
  expect(positions[0].receive_fixing_days_lag).toBe(2);
  expect(positions[0].pay_reset_convention).toBe("in_advance");
  expect(positions[0].receive_reset_convention).toBe("in_advance");
  expect(positions[0].float_leg_frequency_months).toBe(3);
  expect(positions[0].fixed_leg_frequency_months).toBe(3);
});
