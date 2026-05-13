import * as XLSX from "xlsx";

export const exportCSV = (tables: Record<string, any>, prefix: string) => {
  Object.entries(tables).forEach(([name, rows]) => {
    const csv = rowsToCsv(rows);
    downloadFile(`${prefix}_${name}.csv`, csv, "text/csv;charset=utf-8;");
  });
};

export const exportJSON = (tables: Record<string, any>, filename: string) => {
  const payload = JSON.stringify(tables, null, 2);
  downloadFile(filename, payload, "application/json");
};

export const exportExcel = (tables: Record<string, any>, filename: string) => {
  const wb = XLSX.utils.book_new();
  Object.entries(tables).forEach(([name, rows]) => {
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  });
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  triggerBlob(filename, blob);
};

const rowsToCsv = (rows: any[]): string => {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const body = rows.map((r) => keys.map((k) => r[k]).join(",")).join("\n");
  return `${header}\n${body}`;
};

const downloadFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  triggerBlob(filename, blob);
};

const triggerBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
