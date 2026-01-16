import { ChangeEvent } from "react";
import { MarketScenario, OptionPosition, ValidationMessage } from "../types";
import { validatePosition } from "../lib/math";

interface Props {
  onPortfolio: (positions: OptionPosition[], log: ValidationMessage[]) => void;
  onScenarios: (scenarios: MarketScenario[]) => void;
  onLimits: (limits: Record<string, any>) => void;
}

const readFile = (e: ChangeEvent<HTMLInputElement>, cb: (text: string) => void) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    cb(text);
  };
  reader.readAsText(file);
};

const parseCsv = (text: string): Record<string, string>[] => {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const headers = headerLine.split(",").map((h) => h.trim());
  return lines.map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx]?.trim() ?? "";
    });
    return row;
  });
};

export default function DataUpload({ onPortfolio, onScenarios, onLimits }: Props) {
  const loadPortfolio = (text: string) => {
    const rows = parseCsv(text);
    const positions: OptionPosition[] = [];
    const log: ValidationMessage[] = [];
    rows.forEach((row, idx) => {
      const errors = validatePosition(row);
      if (errors.length) {
        log.push({ severity: "ERROR", message: errors.join("; "), row: idx + 2 });
        return;
      }
      positions.push({
        position_id: row.position_id,
        option_type: row.option_type as any,
        style: (row.style || "european") as any,
        quantity: Number(row.quantity),
        underlying_symbol: row.underlying_symbol,
        currency: row.currency || "RUB",
        underlying_price: Number(row.underlying_price),
        strike: Number(row.strike),
        volatility: Number(row.volatility),
        maturity_date: row.maturity_date,
        valuation_date: row.valuation_date,
        risk_free_rate: Number(row.risk_free_rate),
        dividend_yield: Number(row.dividend_yield || 0),
        liquidity_haircut: Number(row.liquidity_haircut || 0),
        model: (row.model || "black_scholes") as any,
      });
    });
    onPortfolio(positions, log);
  };

  const loadScenarios = (text: string) => {
    const rows = parseCsv(text);
    const scenarios: MarketScenario[] = rows.map((r) => ({
      scenario_id: r.scenario_id,
      underlying_shift: Number(r.underlying_shift || 0),
      volatility_shift: Number(r.volatility_shift || 0),
      rate_shift: Number(r.rate_shift || 0),
    }));
    onScenarios(scenarios);
  };

  const loadJson = (text: string, target: "portfolio" | "scenarios" | "limits") => {
    const parsed = JSON.parse(text);
    if (target === "portfolio") {
      const rows = Array.isArray(parsed) ? parsed : parsed.positions;
      const positions: OptionPosition[] = [];
      const log: ValidationMessage[] = [];
      rows.forEach((row: any, idx: number) => {
        const errors = validatePosition(row);
        if (errors.length) {
          log.push({ severity: "ERROR", message: errors.join("; "), row: idx });
          return;
        }
        positions.push(row as OptionPosition);
      });
      onPortfolio(positions, log);
    }
    if (target === "scenarios") {
      const rows = Array.isArray(parsed) ? parsed : parsed.scenarios;
      onScenarios(rows as MarketScenario[]);
    }
    if (target === "limits") {
      onLimits(parsed as Record<string, any>);
    }
  };

  return (
    <div className="grid">
      <div>
        <p className="code">Портфель: CSV/JSON (обязательные поля, ISO даты, валюты ISO 4217)</p>
        <input type="file" accept=".csv,.json" onChange={(e) => readFile(e, (text) => {
          if ((e.target.files?.[0]?.name || "").endsWith(".json")) loadJson(text, "portfolio");
          else loadPortfolio(text);
        })} />
      </div>
      <div>
        <p className="code">Сценарии: CSV/JSON</p>
        <input type="file" accept=".csv,.json" onChange={(e) => readFile(e, (text) => {
          if ((e.target.files?.[0]?.name || "").endsWith(".json")) loadJson(text, "scenarios");
          else loadScenarios(text);
        })} />
      </div>
      <div>
        <p className="code">Лимиты: JSON</p>
        <input type="file" accept=".json" onChange={(e) => readFile(e, (text) => loadJson(text, "limits"))} />
      </div>
    </div>
  );
}
