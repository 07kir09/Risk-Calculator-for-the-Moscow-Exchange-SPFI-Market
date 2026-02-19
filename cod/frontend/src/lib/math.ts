import { OptionPosition, OptionType, OptionStyle, MarketScenario } from "../types";

const normCdf = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));
const normPdf = (x: number): number => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
const erf = (x: number): number => {
  // численное приближение Эрфа (Abramowitz and Stegun 7.1.26)
  const sign = Math.sign(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
};

export const timeToMaturity = (valuation: string, maturity: string): number => {
  const v = new Date(valuation);
  const m = new Date(maturity);
  const ms = m.getTime() - v.getTime();
  if (ms <= 0) return 0;
  return ms / (1000 * 60 * 60 * 24 * 365);
};

export const d1d2 = (p: OptionPosition): [number, number] => {
  const t = timeToMaturity(p.valuation_date, p.maturity_date);
  const sigma = p.volatility;
  const s = p.underlying_price;
  const k = p.strike;
  const r = p.risk_free_rate;
  const q = p.dividend_yield ?? 0;
  const d1 = (Math.log(s / k) + (r - q + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  return [d1, d2];
};

export const bsPrice = (p: OptionPosition): number => {
  const t = timeToMaturity(p.valuation_date, p.maturity_date);
  if (t <= 0) return intrinsic(p);
  const [d1, d2] = d1d2(p);
  const s = p.underlying_price;
  const k = p.strike;
  const r = p.risk_free_rate;
  const q = p.dividend_yield ?? 0;
  if (p.option_type === "call") {
    return s * Math.exp(-q * t) * normCdf(d1) - k * Math.exp(-r * t) * normCdf(d2);
  }
  return k * Math.exp(-r * t) * normCdf(-d2) - s * Math.exp(-q * t) * normCdf(-d1);
};

export const intrinsic = (p: OptionPosition): number => {
  return p.option_type === "call" ? Math.max(p.underlying_price - p.strike, 0) : Math.max(p.strike - p.underlying_price, 0);
};

export const binomialPrice = (p: OptionPosition, steps = 200): number => {
  const t = timeToMaturity(p.valuation_date, p.maturity_date);
  if (t <= 0) return intrinsic(p);
  const dt = t / steps;
  const sigma = p.volatility;
  const r = p.risk_free_rate;
  const q = p.dividend_yield ?? 0;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const disc = Math.exp(-r * dt);
  const prob = (Math.exp((r - q) * dt) - d) / (u - d);
  if (prob < 0 || prob > 1) throw new Error("Риск-нейтральная вероятность вне [0,1]");
  const prices = new Array(steps + 1).fill(0);
  const values = new Array(steps + 1).fill(0);
  for (let i = 0; i <= steps; i++) {
    prices[i] = p.underlying_price * Math.pow(u, steps - i) * Math.pow(d, i);
    values[i] = p.option_type === "call" ? Math.max(prices[i] - p.strike, 0) : Math.max(p.strike - prices[i], 0);
  }
  for (let step = steps - 1; step >= 0; step--) {
    for (let i = 0; i <= step; i++) {
      const continuation = disc * (prob * values[i] + (1 - prob) * values[i + 1]);
      const exercise = p.option_type === "call" ? Math.max(prices[i] / u - p.strike, 0) : Math.max(p.strike - prices[i] / u, 0);
      values[i] = p.style === "american" ? Math.max(continuation, exercise) : continuation;
      prices[i] = prices[i] / u;
    }
  }
  return values[0];
};

export const mcPrice = (p: OptionPosition, nPaths = 20000, seed = 42): number => {
  const t = timeToMaturity(p.valuation_date, p.maturity_date);
  if (t <= 0) return intrinsic(p);
  const rng = mulberry32(seed);
  let sum = 0;
  const sigma = p.volatility;
  const r = p.risk_free_rate;
  const q = p.dividend_yield ?? 0;
  for (let i = 0; i < nPaths; i++) {
    const z = gaussian(rng);
    const st = p.underlying_price * Math.exp((r - q - 0.5 * sigma * sigma) * t + sigma * Math.sqrt(t) * z);
    const payoff = p.option_type === "call" ? Math.max(st - p.strike, 0) : Math.max(p.strike - st, 0);
    sum += payoff;
  }
  return Math.exp(-r * t) * (sum / nPaths);
};

const mulberry32 = (a: number) => {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const gaussian = (rng: () => number): number => {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

export const pricePosition = (p: OptionPosition): number => {
  if (p.style === "american") return binomialPrice(p);
  if (p.model === "mc") return mcPrice(p);
  if (p.model === "binomial") return binomialPrice(p);
  return bsPrice(p);
};

export const portfolioValue = (positions: OptionPosition[]): number => positions.reduce((acc, p) => acc + pricePosition(p) * p.quantity, 0);

export const greeks = (p: OptionPosition) => {
  const t = timeToMaturity(p.valuation_date, p.maturity_date);
  if (t <= 0) return { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  const [d1, d2] = d1d2(p);
  const s = p.underlying_price;
  const k = p.strike;
  const r = p.risk_free_rate;
  const q = p.dividend_yield ?? 0;
  const delta = p.option_type === "call" ? Math.exp(-q * t) * normCdf(d1) : -Math.exp(-q * t) * normCdf(-d1);
  const gamma = (Math.exp(-q * t) * normPdf(d1)) / (s * p.volatility * Math.sqrt(t));
  const vega = s * Math.exp(-q * t) * normPdf(d1) * Math.sqrt(t);
  const thetaCall = (-s * normPdf(d1) * p.volatility * Math.exp(-q * t)) / (2 * Math.sqrt(t)) - r * k * Math.exp(-r * t) * normCdf(d2) + q * s * Math.exp(-q * t) * normCdf(d1);
  const thetaPut = (-s * normPdf(d1) * p.volatility * Math.exp(-q * t)) / (2 * Math.sqrt(t)) + r * k * Math.exp(-r * t) * normCdf(-d2) - q * s * Math.exp(-q * t) * normCdf(-d1);
  const theta = p.option_type === "call" ? thetaCall : thetaPut;
  const rho = p.option_type === "call" ? k * t * Math.exp(-r * t) * normCdf(d2) : -k * t * Math.exp(-r * t) * normCdf(-d2);
  return { delta, gamma, vega, theta, rho };
};

export const aggregateGreeks = (positions: OptionPosition[]) => {
  return positions.reduce(
    (acc, p) => {
      const g = greeks(p);
      acc.delta += g.delta * p.quantity;
      acc.gamma += g.gamma * p.quantity;
      acc.vega += g.vega * p.quantity;
      acc.theta += g.theta * p.quantity;
      acc.rho += g.rho * p.quantity;
      return acc;
    },
    { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 }
  );
};

export const scenarioPnL = (positions: OptionPosition[], s: MarketScenario): number => {
  const bumped = positions.map((p) => ({
    ...p,
    underlying_price: p.underlying_price * (1 + s.underlying_shift),
    volatility: Math.max(1e-8, p.volatility * (1 + s.volatility_shift)),
    risk_free_rate: p.risk_free_rate + s.rate_shift,
  }));
  return portfolioValue(bumped) - portfolioValue(positions);
};

export const applyPnLDistribution = (positions: OptionPosition[], scenarios: MarketScenario[]): number[] => scenarios.map((s) => scenarioPnL(positions, s));

export const historicalVar = (pnls: number[], alpha = 0.99): number => {
  if (!pnls.length) throw new Error("Пустой массив PnL для VaR");
  const sortedPnls = [...pnls].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(sortedPnls.length * (1 - alpha)));
  return Math.max(0, -sortedPnls[k - 1]);
};

export const historicalEs = (pnls: number[], alpha = 0.99): number => {
  if (!pnls.length) throw new Error("Пустой массив PnL для ES");
  const sortedPnls = [...pnls].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(sortedPnls.length * (1 - alpha)));
  const tail = sortedPnls.slice(0, k);
  const tailMean = tail.reduce((a, b) => a + b, 0) / tail.length;
  return Math.max(0, -tailMean);
};

export const parametricVar = (pnls: number[], alpha = 0.99): number => {
  if (!pnls.length) throw new Error("Пустой массив PnL для параметрического VaR");
  const mu = mean(pnls);
  const sigma = std(pnls);
  const z = invNorm(alpha);
  return -mu + sigma * z;
};

export const parametricEs = (pnls: number[], alpha = 0.99): number => {
  if (!pnls.length) throw new Error("Пустой массив PnL для параметрического ES");
  const mu = mean(pnls);
  const sigma = std(pnls);
  const z = invNorm(alpha);
  const pdf = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  return -mu + sigma * (pdf / (1 - alpha));
};

export const liquidityAdjustedVar = (
  varValue: number,
  positions: OptionPosition[],
  model: "fraction_of_position_value" | "half_spread_fraction" | "absolute_per_contract" = "fraction_of_position_value"
): number => {
  const charge = positions.reduce((acc, p) => {
    const haircut = Math.max(0, p.liquidity_haircut ?? 0);
    if (model === "absolute_per_contract") return acc + Math.abs(p.quantity) * haircut;
    const positionValueAbs = Math.abs(pricePosition(p) * p.quantity);
    if (model === "half_spread_fraction") return acc + 0.5 * haircut * positionValueAbs;
    return acc + haircut * positionValueAbs;
  }, 0);
  return varValue + charge;
};

const mean = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / arr.length;
const std = (arr: number[]): number => {
  const m = mean(arr);
  const v = arr.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (arr.length - 1);
  return Math.sqrt(v);
};

// Простое приближение обратной функции нормального распределения (Acklam)
const invNorm = (p: number): number => {
  if (p <= 0 || p >= 1) throw new Error("p must be in (0,1)");
  const a1 = -39.6968302866538,
    a2 = 220.946098424521,
    a3 = -275.928510446969,
    a4 = 138.357751867269,
    a5 = -30.6647980661472,
    a6 = 2.50662827745924;
  const b1 = -54.4760987982241,
    b2 = 161.585836858041,
    b3 = -155.698979859887,
    b4 = 66.8013118877197,
    b5 = -13.2806815528857;
  const c1 = -0.00778489400243029,
    c2 = -0.322396458041136,
    c3 = -2.40075827716184,
    c4 = -2.54973253934373,
    c5 = 4.37466414146497,
    c6 = 2.93816398269878;
  const d1 = 0.00778469570904146,
    d2 = 0.32246712907004,
    d3 = 2.445134137143,
    d4 = 3.75440866190742;
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  if (phigh < p) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) / ((((d1 * q + d2) * q + d3) * q + d4) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q / (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1);
};

export const validatePosition = (row: any): string[] => {
  const errors: string[] = [];
  const required = ["position_id", "option_type", "style", "quantity", "underlying_symbol", "currency", "underlying_price", "strike", "volatility", "maturity_date", "valuation_date", "risk_free_rate"];
  for (const key of required) {
    if (row[key] === undefined || row[key] === "") errors.push(`Поле ${key} обязательно`);
  }
  if (Number(row.quantity) === 0) errors.push("Количество не может быть нулевым");
  if (Number(row.underlying_price) <= 0) errors.push("Цена базового актива должна быть > 0");
  if (Number(row.strike) <= 0) errors.push("Страйк должен быть > 0");
  if (Number(row.volatility) <= 0) errors.push("Волатильность должна быть > 0");
  if (!/^([A-Z]{3})$/.test(String(row.currency || "").toUpperCase())) errors.push("Валюта должна быть ISO 4217");
  const ttm = timeToMaturity(String(row.valuation_date), String(row.maturity_date));
  if (ttm <= 0) errors.push("Дата экспирации должна быть позже даты оценки");
  return errors;
};
