export type InstrumentType = "option" | "forward" | "swap_ir";

export interface PositionDTO {
  instrument_type: InstrumentType;
  position_id: string;
  option_type: "call" | "put";
  style: "european" | "american";
  quantity: number;
  notional: number;
  underlying_symbol: string;
  underlying_price: number;
  strike: number;
  volatility: number;
  maturity_date: string;
  valuation_date: string;
  risk_free_rate: number;
  dividend_yield?: number;
  currency: string;
  liquidity_haircut?: number;
  model?: string;
  fixed_rate?: number | null;
  float_rate?: number | null;
  day_count?: number | null;
}

export interface ImportLogEntry {
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  row?: number;
  field?: string;
}
