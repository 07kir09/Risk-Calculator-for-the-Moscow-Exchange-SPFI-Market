import React, { useMemo, useState } from "react";
import { calcRisk, Method, RiskOutput } from "./risk";

function parseReturns(text: string): number[] {
  const tokens = text
    .replaceAll(";", " ")
    .replaceAll(",", " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);

  const nums = tokens.map(t => Number(t));
  if (nums.some(x => Number.isNaN(x))) {
    throw new Error("Не удалось распарсить доходности. Пример: 0.01 -0.02 0.005");
  }
  return nums;
}

export default function App() {
  const [returnsText, setReturnsText] = useState("0.01 0.005 -0.02 0.015 -0.01 0.007 -0.003");
  const [portfolioValue, setPortfolioValue] = useState(1_000_000);
  const [confidence, setConfidence] = useState(0.99);
  const [method, setMethod] = useState<Method>("historical");

  const [result, setResult] = useState<RiskOutput | null>(null);
  const [error, setError] = useState("");

  const preview = useMemo(() => {
    try {
      const rs = parseReturns(returnsText);
      return `n=${rs.length}, min=${Math.min(...rs)}, max=${Math.max(...rs)}`;
    } catch {
      return "parse error";
    }
  }, [returnsText]);

  function onCalc() {
    setError("");
    setResult(null);
    try {
      const rs = parseReturns(returnsText);
      const out = calcRisk({
        returns: rs,
        portfolioValue,
        confidence,
        method
      });
      setResult(out);
    } catch (e: any) {
      setError(e?.message ?? "Unknown error");
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>Risk Calculator (demo, no API)</h1>
      <p style={{ opacity: 0.8 }}>
        Всё считается локально в браузере. Это стартовый прототип, чтобы было “что-то”.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <label>
          Доходности (decimal, 0.01 = +1%):
          <textarea
            value={returnsText}
            onChange={(e) => setReturnsText(e.target.value)}
            rows={5}
            style={{ width: "100%", marginTop: 6, fontFamily: "monospace" }}
          />
          <div style={{ fontSize: 12, opacity: 0.7 }}>Preview: {preview}</div>
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label>
            Portfolio value:
            <input
              type="number"
              value={portfolioValue}
              onChange={(e) => setPortfolioValue(Number(e.target.value))}
              style={{ width: "100%", marginTop: 6 }}
            />
          </label>

          <label>
            Confidence:
            <input
              type="number"
              step="0.001"
              min="0.5"
              max="0.9999"
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              style={{ width: "100%", marginTop: 6 }}
            />
          </label>

          <label>
            Method:
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)} style={{ width: "100%", marginTop: 6 }}>
              <option value="historical">historical</option>
              <option value="parametric_normal">parametric_normal</option>
            </select>
          </label>
        </div>

        <button onClick={onCalc} style={{ padding: "10px 14px", cursor: "pointer" }}>
          Calculate VaR / ES
        </button>

        {error && (
          <div style={{ padding: 12, background: "#ffe7e7", border: "1px solid #ffb3b3" }}>
            <b>Error:</b> {error}
          </div>
        )}

        {result && (
          <div style={{ padding: 12, background: "#f3f6ff", border: "1px solid #cdd7ff" }}>
            <h3 style={{ marginTop: 0 }}>Result</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><b>VaR:</b> {result.var}</div>
              <div><b>ES:</b> {result.es}</div>
              <div><b>mu:</b> {result.mu}</div>
              <div><b>sigma:</b> {result.sigma}</div>
              <div><b>n:</b> {result.n}</div>
              <div><b>method:</b> {result.method}</div>
            </div>

            <details style={{ marginTop: 12 }}>
              <summary>JSON</summary>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>

      <hr style={{ margin: "24px 0" }} />
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        Дальше вы сможете: добавить загрузку CSV, выбор инструмента, графики, и только потом прикрутить API.
      </p>
    </div>
  );
}