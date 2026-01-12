export type Method = "historical" | "parametric_normal";

export type RiskInput = {
  returns: number[];        // доходности: 0.01 = +1%
  portfolioValue: number;   // стоимость портфеля
  confidence: number;       // например 0.99
  method: Method;
};

export type RiskOutput = {
  method: Method;
  confidence: number;
  var: number;   // positive "loss" in currency
  es: number;    // positive "loss" in currency
  mu: number;
  sigma: number;
  n: number;
};

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdevSample(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((acc, x) => acc + (x - mu) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/**
 * Нормальное CDF^-1 (квантиль) — аппроксимация Acklam.
 * Достаточно для демо.
 */
function normInv(p: number): number {
  // guards
  if (p <= 0 || p >= 1) throw new Error("normInv: p must be in (0,1)");

  const a = [
    -3.969683028665376e+01,
     2.209460984245205e+02,
    -2.759285104469687e+02,
     1.383577518672690e+02,
    -3.066479806614716e+01,
     2.506628277459239e+00
  ];

  const b = [
    -5.447609879822406e+01,
     1.615858368580409e+02,
    -1.556989798598866e+02,
     6.680131188771972e+01,
    -1.328068155288572e+01
  ];

  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
     4.374664141464968e+00,
     2.938163982698783e+00
  ];

  const d = [
     7.784695709041462e-03,
     3.224671290700398e-01,
     2.445134137142996e+00,
     3.754408661907416e+00
  ];

  const plow = 0.02425;
  const phigh = 1 - plow;

  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
           ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }

  if (phigh < p) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
             ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  }

  q = p - 0.5;
  r = q * q;
  return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q /
         (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
}

function normPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

export function calcRisk(input: RiskInput): RiskOutput {
  const { returns, portfolioValue, confidence, method } = input;

  if (returns.length < 2) throw new Error("Нужно минимум 2 доходности");
  if (!(confidence > 0.5 && confidence < 0.9999)) throw new Error("Confidence вне диапазона");
  if (!(portfolioValue > 0)) throw new Error("Portfolio value должно быть > 0");

  const mu = mean(returns);
  const sigma = stdevSample(returns, mu);
  const n = returns.length;

  const alpha = 1 - confidence;

  if (method === "historical") {
    const sorted = [...returns].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(n - 1, Math.floor(alpha * n)));
    const q = sorted[idx]; // левый квантиль

    const varLoss = Math.max(0, -q * portfolioValue);

    const tail = sorted.filter(r => r <= q);
    const esReturn = tail.length ? mean(tail) : q;
    const esLoss = Math.max(0, -esReturn * portfolioValue);

    return {
      method,
      confidence,
      var: Number(varLoss.toFixed(2)),
      es: Number(esLoss.toFixed(2)),
      mu,
      sigma,
      n
    };
  }

  // parametric_normal
  if (sigma === 0) {
    const loss = Math.max(0, -mu * portfolioValue);
    return {
      method,
      confidence,
      var: Number(loss.toFixed(2)),
      es: Number(loss.toFixed(2)),
      mu,
      sigma,
      n
    };
  }

  // левый квантиль по нормали
  const z = normInv(alpha); // отрицательный
  const q = mu + sigma * z;

  const varLoss = Math.max(0, -q * portfolioValue);

  // ES для нормали: ES = -(mu - sigma * phi(z)/alpha) * V
  const esReturn = mu - sigma * (normPdf(z) / alpha);
  const esLoss = Math.max(0, -esReturn * portfolioValue);

  return {
    method,
    confidence,
    var: Number(varLoss.toFixed(2)),
    es: Number(esLoss.toFixed(2)),
    mu,
    sigma,
    n
  };
}