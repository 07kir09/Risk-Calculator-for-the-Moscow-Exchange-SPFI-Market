import Papa from "papaparse";
import * as XLSX from "xlsx";
import { parsePortfolioCsv } from "../validation/portfolioCsv";

export type PortfolioImportSource = "csv" | "xlsx" | "paste";

export type PortfolioImportFileInput = {
  kind: "file";
  file: File;
};

export type PortfolioImportTextInput = {
  kind: "text";
  text: string;
  source?: Exclude<PortfolioImportSource, "xlsx">;
};

export type PortfolioImportInput = PortfolioImportFileInput | PortfolioImportTextInput;

type ParseOutcome = ReturnType<typeof parsePortfolioCsv> & { encoding: string };
type ParseResult = ReturnType<typeof parsePortfolioCsv>;

type PortfolioImportAdapter = {
  source: PortfolioImportSource;
  canHandle(input: PortfolioImportInput): boolean;
  parse(input: PortfolioImportInput): Promise<ParseResult>;
};

function collectLogStats(log: ReturnType<typeof parsePortfolioCsv>["log"]) {
  return {
    errors: log.filter((entry) => entry.severity === "ERROR").length,
    warnings: log.filter((entry) => entry.severity === "WARNING").length,
  };
}

function compareParseOutcome(a: ParseOutcome, b: ParseOutcome): number {
  if (a.positions.length !== b.positions.length) return b.positions.length - a.positions.length;
  const aStats = collectLogStats(a.log);
  const bStats = collectLogStats(b.log);
  if (aStats.errors !== bStats.errors) return aStats.errors - bStats.errors;
  if (aStats.warnings !== bStats.warnings) return aStats.warnings - bStats.warnings;
  if (a.encoding === "utf-8" && b.encoding !== "utf-8") return -1;
  if (b.encoding === "utf-8" && a.encoding !== "utf-8") return 1;
  return 0;
}

async function readFileAsText(file: File, encoding?: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать CSV-файл"));
    if (encoding) reader.readAsText(file, encoding);
    else reader.readAsText(file);
  });
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error("Не удалось прочитать Excel-файл"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать Excel-файл"));
    reader.readAsArrayBuffer(file);
  });
}

function isExcelFileName(filename: string): boolean {
  return /\.(xlsx|xls)$/i.test(filename);
}

function toCsvTextFromSheet(sheet: XLSX.WorkSheet): string {
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
    dateNF: "yyyy-mm-dd",
  });
  if (!rows.length) return "";
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const normalized = rows.map((row) =>
    Array.from({ length: width }, (_, index) => {
      const cell = row[index];
      if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      return cell == null ? "" : String(cell);
    })
  );
  return Papa.unparse(normalized, { quotes: false, delimiter: ",", newline: "\n", skipEmptyLines: true });
}

async function parsePortfolioCsvFromFile(file: File) {
  const encodings = ["utf-8", "windows-1251"];
  const outcomes: ParseOutcome[] = [];

  for (const encoding of encodings) {
    try {
      const text = await readFileAsText(file, encoding);
      outcomes.push({ ...parsePortfolioCsv(text), encoding });
    } catch {
      // Ignore and try the next encoding.
    }
  }

  if (!outcomes.length) {
    const text = await readFileAsText(file);
    return parsePortfolioCsv(text);
  }

  outcomes.sort(compareParseOutcome);
  const best = outcomes[0];
  return { positions: best.positions, log: best.log };
}

async function parsePortfolioExcelFromFile(file: File) {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name];
    return sheet && Object.keys(sheet).length > 0;
  });
  if (!sheetName) throw new Error("Excel-файл не содержит листов с данными.");
  const sheet = workbook.Sheets[sheetName];
  const text = toCsvTextFromSheet(sheet);
  if (!text.trim()) throw new Error(`Лист "${sheetName}" не содержит данных.`);
  return parsePortfolioCsv(text);
}

function parsePortfolioText(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) {
    return {
      positions: [],
      log: [{ severity: "ERROR" as const, field: "paste", message: "Вставка пуста: скопируйте строку заголовков и хотя бы одну строку данных." }],
    };
  }
  return parsePortfolioCsv(normalized);
}

const portfolioImportAdapters: PortfolioImportAdapter[] = [
  {
    source: "paste",
    canHandle: (input) => input.kind === "text" && input.source === "paste",
    parse: async (input) => {
      if (input.kind !== "text") throw new Error("Paste-импорт доступен только для текста.");
      return parsePortfolioText(input.text);
    },
  },
  {
    source: "xlsx",
    canHandle: (input) => input.kind === "file" && isExcelFileName(input.file.name),
    parse: async (input) => {
      if (input.kind !== "file") throw new Error("Excel-импорт доступен только для файлов.");
      return parsePortfolioExcelFromFile(input.file);
    },
  },
  {
    source: "csv",
    canHandle: (input) => (input.kind === "file" && !isExcelFileName(input.file.name)) || (input.kind === "text" && input.source !== "paste"),
    parse: async (input) => {
      if (input.kind === "file") return parsePortfolioCsvFromFile(input.file);
      return parsePortfolioText(input.text);
    },
  },
];

export function detectPortfolioImportSource(filename: string): PortfolioImportSource {
  return isExcelFileName(filename) ? "xlsx" : "csv";
}

export async function parsePortfolioFile(file: File) {
  return parsePortfolioInput({ kind: "file", file });
}

export async function parsePortfolioInput(input: PortfolioImportInput) {
  const adapter = portfolioImportAdapters.find((candidate) => candidate.canHandle(input));
  if (!adapter) {
    throw new Error("Не удалось определить формат файла портфеля.");
  }
  return adapter.parse(input);
}

export async function parsePortfolioPaste(text: string) {
  return parsePortfolioInput({ kind: "text", text, source: "paste" });
}
