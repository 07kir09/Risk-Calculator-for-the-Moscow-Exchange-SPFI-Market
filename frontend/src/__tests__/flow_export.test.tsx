import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";
import App from "../App";
import { renderWithProviders, runConfiguredCalculation, seedReadyForConfigure } from "./testUtils";

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function createObjectUrlMock() {
  return URL.createObjectURL as unknown as {
    mock: { calls: Array<[Blob]> };
    mockClear: () => void;
  };
}

test("экспорт: формирование Excel файла (вызов download)", async () => {
  const user = userEvent.setup();
  const createObjectURL = createObjectUrlMock();
  createObjectURL.mockClear();
  seedReadyForConfigure();
  renderWithProviders(<App />, { route: "/configure" });

  await runConfiguredCalculation(user);

  const exportButton = await screen.findByRole("button", { name: /^Экспорт$/i });
  await user.click(exportButton);

  expect(await screen.findByRole("heading", { name: /Экспорт/i })).toBeInTheDocument();
  expect((await screen.findAllByText(/Методологический статус/i)).length).toBeGreaterThan(0);
  expect(screen.getByText(/methodology_status: preliminary/i)).toBeInTheDocument();
  expect(screen.getByText(/Источник порогов: draft_auto/i)).toBeInTheDocument();
  expect(screen.getAllByText(/Покрытие секций/i).length).toBeGreaterThan(0);

  const excelBtn = screen.getByRole("button", { name: /Скачать отчёт \(Excel\)/i });
  await user.click(excelBtn);

  expect(createObjectURL.mock.calls.length).toBeGreaterThan(0);
  const excelBlob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
  const workbook = XLSX.read(await readBlobArrayBuffer(excelBlob), { type: "array" });
  expect(workbook.SheetNames).toContain("Methodology");
  const methodologySheet = workbook.Sheets.Methodology;
  const methodologyRows = XLSX.utils.sheet_to_json(methodologySheet, { header: 1, raw: false }) as string[][];
  const methodologyMap = new Map(methodologyRows.slice(1).map(([key, value]) => [key, value]));
  expect(methodologyMap.get("methodology_status")).toBe("preliminary");
  expect(methodologyMap.get("limit_source")).toBe("draft_auto");
  expect(methodologyMap.get("preliminary")).toBe("TRUE");
  expect(methodologyMap.get("var_method")).toBe("scenario_quantile");
  expect(methodologyMap.get("stress_source")).toBe("backend_calculated");
  expect(methodologyMap.get("backend_calculated")).toBe("TRUE");
  expect(methodologyMap.get("draft_policy_note")).toMatch(/не являются утверждённой risk-policy/i);
  expect(methodologyMap.get("scenario_count")).toMatch(/^\d+$/);
  expect(methodologyMap.get("export_generated_at")).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  const jsonBtn = screen.getByRole("button", { name: /Скачать JSON/i });
  await user.click(jsonBtn);
  const blob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
  const payload = JSON.parse(await readBlobText(blob));
  expect(payload.methodology_metadata).toMatchObject({
    methodology_status: "preliminary",
    limit_source: "draft_auto",
    preliminary: true,
    var_method: "scenario_quantile",
    stress_source: "backend_calculated",
    backend_calculated: true,
  });
});
