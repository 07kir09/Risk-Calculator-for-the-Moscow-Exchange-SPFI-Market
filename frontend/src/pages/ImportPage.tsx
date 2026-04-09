import { ReactNode, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  Button as HeroButton,
  Chip,
  Drawer,
  Input,
  Modal,
  ScrollShadow,
  Skeleton,
  Table,
  Tabs,
} from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { uploadMarketDataBundleFile } from "../api/endpoints";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import FileDropzone from "../components/FileDropzone";
import { ImportLogEntry, PositionDTO } from "../api/types";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { useAppData } from "../state/appDataStore";
import { isMarketDataBundleFile } from "../lib/marketDataFiles";
import { showBlockedNavigationToast } from "../lib/blockedNavigationToast";
import { demoPositions } from "../mock/demoData";
import { parsePortfolioCsv } from "../validation/portfolioCsv";

type ParseOutcome = ReturnType<typeof parsePortfolioCsv> & { encoding: string };

function collectLogStats(log: ReturnType<typeof parsePortfolioCsv>["log"]) {
  return {
    errors: log.filter((x) => x.severity === "ERROR").length,
    warnings: log.filter((x) => x.severity === "WARNING").length,
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

async function parsePortfolioCsvFromFile(file: File) {
  const readAsText = (encoding?: string) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать CSV-файл"));
      if (encoding) reader.readAsText(file, encoding);
      else reader.readAsText(file);
    });

  const encodings = ["utf-8", "windows-1251"];
  const outcomes: ParseOutcome[] = [];
  for (const encoding of encodings) {
    try {
      const text = await readAsText(encoding);
      outcomes.push({ ...parsePortfolioCsv(text), encoding });
    } catch { /* ignore */ }
  }
  if (!outcomes.length) {
    const text = await readAsText();
    return parsePortfolioCsv(text);
  }
  outcomes.sort(compareParseOutcome);
  const best = outcomes[0];
  return { positions: best.positions, log: best.log };
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) { resolve(reader.result); return; }
      reject(new Error("Не удалось прочитать Excel-файл"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать Excel-файл"));
    reader.readAsArrayBuffer(file);
  });
}

function isExcelFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name);
}

function toCsvTextFromSheet(sheet: XLSX.WorkSheet): string {
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1, raw: false, defval: "", blankrows: false, dateNF: "yyyy-mm-dd",
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

async function parsePortfolioFile(file: File) {
  if (isExcelFile(file)) return parsePortfolioExcelFromFile(file);
  return parsePortfolioCsvFromFile(file);
}

function positionStats(positions: PositionDTO[]) {
  const byType = new Map<string, number>();
  positions.forEach((p) => { byType.set(p.instrument_type, (byType.get(p.instrument_type) ?? 0) + 1); });
  return Array.from(byType.entries());
}

function instrumentTypeLabel(type: string) {
  switch (type) {
    case "option":   return "Опционы";
    case "forward":  return "Форварды";
    case "swap_ir":  return "Свопы";
    default:         return type;
  }
}

const REQUIRED_COLS = ["instrument_type", "position_id", "quantity", "notional", "underlying_symbol", "currency"];
const REQUIRED_COLS_META: Record<string, string> = {
  instrument_type: "Тип инструмента: option, forward, swap_ir",
  position_id: "Уникальный идентификатор позиции",
  quantity: "Количество в контрактных единицах",
  notional: "Номинал позиции",
  underlying_symbol: "Код базового актива",
  currency: "Код валюты (например, RUB, USD)",
};

type ImportTab = "positions" | "structure";

export default function ImportPage() {
  const nav = useNavigate();
  const { state: wf, dispatch } = useWorkflow();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const [isLoading, setLoading] = useState(false);
  const [lastFilename, setLastFilename] = useState<string | undefined>(undefined);
  const [marketDataNotice, setMarketDataNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<PositionDTO | null>(null);
  const [activeTab, setActiveTab] = useState<ImportTab>("positions");
  const [confirm, setConfirm] = useState<{
    title: string;
    description: ReactNode;
    confirmText?: string;
    danger?: boolean;
    action: () => void;
  } | null>(null);

  const doDemo = () => {
    dataDispatch({ type: "SET_PORTFOLIO", positions: demoPositions, source: "demo" });
    dataDispatch({ type: "SET_VALIDATION_LOG", log: [] });
    dispatch({ type: "RESET_ALL" });
    dispatch({ type: "SET_SNAPSHOT", snapshotId: crypto.randomUUID() });
    dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Import });
    dispatch({ type: "SET_VALIDATION", criticalErrors: 0, warnings: 0, acknowledged: false });
  };

  const importFile = async (file: File) => {
    setLoading(true);
    setMarketDataNotice(null);
    setLastFilename(file.name);
    try {
      const { positions, log } = await parsePortfolioFile(file);
      dataDispatch({ type: "SET_PORTFOLIO", positions, source: "csv", filename: file.name });
      dataDispatch({ type: "SET_VALIDATION_LOG", log });
      dispatch({ type: "RESET_ALL" });
      const critical = log.filter((x) => x.severity === "ERROR").length;
      const warnings = log.filter((x) => x.severity === "WARNING").length;
      dispatch({ type: "SET_VALIDATION", criticalErrors: critical, warnings, acknowledged: false });
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Import });
      if (positions.length > 0) {
        dispatch({ type: "SET_SNAPSHOT", snapshotId: crypto.randomUUID() });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось прочитать файл портфеля.";
      const log: ImportLogEntry[] = [{ severity: "ERROR", field: "file", message }];
      dataDispatch({ type: "SET_PORTFOLIO", positions: [], source: "csv", filename: file.name });
      dataDispatch({ type: "SET_VALIDATION_LOG", log });
      dispatch({ type: "RESET_ALL" });
      dispatch({ type: "SET_VALIDATION", criticalErrors: 1, warnings: 0, acknowledged: false });
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Import });
    } finally {
      setLoading(false);
    }
  };

  const handoffMarketDataFile = async (file: File) => {
    setLoading(true);
    setMarketDataNotice(null);
    try {
      dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "loading" });
      const summary = await uploadMarketDataBundleFile(file, dataState.marketDataSummary?.session_id);
      dataDispatch({ type: "SET_MARKET_DATA_SUMMARY", summary });
      dataDispatch({ type: "RESET_RESULTS" });
      const missingFactors = summary.blocking_errors;
      dispatch({ type: "SET_MARKET_STATUS", missingFactors, status: summary.ready ? "ready" : "idle" });
      if (summary.ready) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
      setMarketDataNotice(`Файл ${file.name} распознан как рыночные данные и добавлен в market data bundle.`);
      if (wf.completedSteps.includes(WorkflowStep.Validate)) nav("/market");
    } catch (error) {
      const message = error instanceof Error ? error.message : `Не удалось передать ${file.name} в market data bundle.`;
      setMarketDataNotice(message);
      dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "idle" });
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (file: File) => {
    if (isMarketDataBundleFile(file.name)) return handoffMarketDataFile(file);
    const go = () => importFile(file);
    if (!hasSomethingToLose) return go();
    setConfirm({
      title: "Заменить текущий портфель?",
      description: (
        <div className="stack">
          <div>Файл <span className="code">{file.name}</span> заменит текущие данные.</div>
          <div className="textMuted">Результаты расчёта будут сброшены.</div>
        </div>
      ),
      confirmText: "Загрузить файл",
      action: go,
    });
  };

  const positions = dataState.portfolio.positions;
  const log = dataState.validationLog;
  const hasSomethingToLose = positions.length > 0 || Boolean(dataState.results.metrics);
  const criticalErrors = useMemo(() => log.filter((x) => x.severity === "ERROR").length, [log]);
  const warnings = useMemo(() => log.filter((x) => x.severity === "WARNING").length, [log]);
  const sourceLabel = positions.length === 0 && !dataState.portfolio.filename ? "Новая сессия" : dataState.portfolio.source.toUpperCase();

  const filteredPositions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return positions;
    return positions.filter((p) =>
      [p.position_id, p.underlying_symbol, p.instrument_type, p.currency]
        .filter(Boolean).some((part) => String(part).toLowerCase().includes(query))
    );
  }, [positions, search]);

  const stats = useMemo(() => positionStats(positions), [positions]);

  const mixRows = useMemo(
    () => stats.map(([label, count]) => ({
      key: label,
      label: instrumentTypeLabel(label),
      count,
      share: positions.length ? (count / positions.length) * 100 : 0,
    })).sort((a, b) => b.count - a.count),
    [positions.length, stats]
  );

  const uniqueUnderlyings = useMemo(
    () => new Set(positions.map((p) => p.underlying_symbol).filter(Boolean)).size,
    [positions]
  );
  const uniqueCurrencies = useMemo(
    () => new Set(positions.map((p) => p.currency).filter(Boolean)).size,
    [positions]
  );

  useEffect(() => {
    if (!dataState.portfolio.filename && dataState.portfolio.positions.length === 0) {
      setLastFilename(undefined);
      setSelectedRow(null);
    }
  }, [dataState.portfolio.filename, dataState.portfolio.positions.length]);

  const statusColor = criticalErrors > 0 ? "danger" : warnings > 0 ? "warning" : positions.length > 0 ? "success" : "default";
  const statusText = criticalErrors > 0 ? `${criticalErrors} ошибок` : warnings > 0 ? `${warnings} предупр.` : positions.length > 0 ? "Портфель загружен" : "Новая сессия";
  const filename = lastFilename ?? dataState.portfolio.filename;
  const canGoValidate = wf.completedSteps.includes(WorkflowStep.Import);

  const handleGoValidate = () => {
    if (!canGoValidate) {
      showBlockedNavigationToast("Чтобы открыть этот раздел, сначала завершите: Шаг 1. Импорт сделок");
      return;
    }
    nav("/validate");
  };

  return (
    <div className="importPagePlain">
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? null}
        confirmText={confirm?.confirmText ?? "Продолжить"}
        danger={confirm?.danger ?? false}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { confirm?.action(); setConfirm(null); }}
      />

      {/* ── Header ── */}
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Импорт портфеля</h1>
          <div className="importHeroMeta">
            <Chip color={statusColor} variant="flat" radius="sm" size="sm">{statusText}</Chip>
            {filename && <span className="importFileTag">{filename}</span>}
            {positions.length > 0 && <span className="importFileTag">{sourceLabel}</span>}
          </div>
        </div>
        <button
          type="button"
          className="importHeroNextLink"
          onClick={handleGoValidate}
          aria-label="К проверке данных"
        >
          <span className="importHeroNextLinkText pageTitle">К проверке данных</span>
          <span className="importHeroNextLinkArrow pageTitle" aria-hidden>→</span>
        </button>
      </div>

      {/* ── Upload zone ── */}
      <div className={`importZone${positions.length > 0 ? " importZone--loaded" : ""}`}>
        <div className="importUploadSplit">
          <div className="importDropPane">
            <FileDropzone
              accept=".csv,.xlsx,.xls"
              inputTestId="portfolio-file"
              disabled={isLoading}
              title={isLoading ? "Читаем файл..." : positions.length > 0 ? "Заменить файл" : "Перетащите файл портфеля сюда"}
              subtitle={
                positions.length > 0
                  ? `Загружено ${positions.length} позиций${filename ? ` из «${filename}»` : ""} — нажмите, чтобы заменить`
                  : "CSV, XLSX, XLS"
              }
              onFile={handleDrop}
              showSystemPickerLink={false}
              extraAction={(
                <Modal>
                  <HeroButton
                    variant="secondary"
                    className="importNoteButton"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    Примечание
                  </HeroButton>
                  <Modal.Backdrop>
                    <Modal.Container>
                      <Modal.Dialog className="importColumnsModal">
                        <Modal.CloseTrigger />
                        <Modal.Header>
                          <Modal.Heading>Подсказка по формату файла</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                          <p className="importColumnsModalText">Для корректного расчета нужны 6 обязательных колонок:</p>
                          <ul className="importColumnsList">
                            {REQUIRED_COLS.map((col) => (
                              <li key={col}>
                                <span className="importColumnsListName">{col}</span>
                                <span className="importColumnsListHint">{REQUIRED_COLS_META[col]}</span>
                              </li>
                            ))}
                          </ul>
                        </Modal.Body>
                        <Modal.Footer>
                          <HeroButton className="w-full" variant="secondary" slot="close">
                            Понятно
                          </HeroButton>
                        </Modal.Footer>
                      </Modal.Dialog>
                    </Modal.Container>
                  </Modal.Backdrop>
                </Modal>
              )}
            />
          </div>

          <button
            type="button"
            className="importDemoTile"
            onClick={() => {
              setMarketDataNotice(null);
              if (!hasSomethingToLose) return doDemo();
              setConfirm({
                title: "Загрузить демо-портфель?",
                description: (
                  <div className="stack">
                    <div>Текущий набор позиций и результаты будут заменены.</div>
                    <div className="textMuted">Это удобно для проверки интерфейса без подготовки файла.</div>
                  </div>
                ),
                confirmText: "Загрузить демо",
                action: doDemo,
              });
            }}
          >
            <div className="importDemoTileTop">
              <span className="importDemoEyebrow">Быстрый старт</span>
              <span className="importDemoAction">Нажать</span>
            </div>
            <div className="importDemoTitle">Демо-портфель</div>
            <div className="importDemoText">
              Готовый набор позиций для проверки экрана импорта без подготовки файла вручную.
            </div>
            <div className="importDemoChips">
              <span>Опцион MOEX</span>
              <span>FX-форвард</span>
              <span>2 позиции</span>
            </div>
          </button>
        </div>

        {!positions.length && !isLoading && (
          <div className="importZoneLinks importZoneLinks--compact">
            <a className="importTemplateLink" href="/sample_portfolio.csv" download>Шаблон CSV</a>
            <a className="importTemplateLink" href="/sample_portfolio.xlsx" download>Шаблон XLSX</a>
          </div>
        )}
        {marketDataNotice && (
          <div className="importZoneNotice">
            <Chip
              color={marketDataNotice.includes("Не удалось") ? "danger" : "success"}
              variant="flat" radius="sm"
            >
              {marketDataNotice}
            </Chip>
          </div>
        )}
      </div>

      {positions.length > 0 && (
        <div className="srOnly" aria-live="polite">
          <div>{`Позиции считаны: ${positions.length}`}</div>
          <div>{`Критических ошибок: ${criticalErrors}`}</div>
          <div>{`Предупреждений: ${warnings}`}</div>
        </div>
      )}

      {/* ── Main body ── */}
      <div className="importBody">

        {/* Left: table / empty state */}
        <div className="importBodyMain">
          {positions.length > 0 ? (
            <>
              <div className="importSwitch">
                <Tabs
                  className="importTabs"
                  selectedKey={activeTab}
                  onSelectionChange={(key) => setActiveTab(String(key) as ImportTab)}
                >
                  <Tabs.ListContainer>
                    <Tabs.List aria-label="Просмотр входных данных">
                      <Tabs.Tab id="positions" className="importSwitchButton">
                        Позиции
                        <Tabs.Indicator />
                      </Tabs.Tab>
                      <Tabs.Tab id="structure" className="importSwitchButton">
                        Структура
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    </Tabs.List>
                  </Tabs.ListContainer>

                  <Tabs.Panel className="importTabsPanel" id="positions">
                    {isLoading ? (
                      <div className="importLoadingShell">
                        <Skeleton className="h-10 rounded-xl" />
                        <Skeleton className="h-10 w-2/3 rounded-xl" />
                        <Skeleton className="h-[300px] rounded-xl" />
                      </div>
                    ) : (
                      <>
                        <div className="importTableToolbar">
                          <div className="importTableToolbarMeta">
                            <strong>Предпросмотр портфеля</strong>
                            <span>
                              {filteredPositions.length} строк • {uniqueUnderlyings} активов • {uniqueCurrencies} валют
                            </span>
                          </div>
                          <Input
                            aria-label="Поиск по позициям"
                            placeholder="Поиск по ID, активу, типу, валюте..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            size="sm"
                            className="importSearchField"
                          />
                          <div className="importToolbarActions">
                            <Button variant="secondary" onClick={() => setSearch("")} isDisabled={!search}>
                              Сбросить фильтр
                            </Button>
                          </div>
                        </div>

                        <ScrollShadow className="importPreviewScroll" size={80}>
                          <Table variant="secondary" className="importPreviewTable">
                            <Table.ScrollContainer className="importTableScrollContainer">
                              <Table.Content aria-label="Предпросмотр портфеля" className="importPositionsTable">
                                <Table.Header>
                                  <Table.Column isRowHeader>ID</Table.Column>
                                  <Table.Column>Тип</Table.Column>
                                  <Table.Column>Базовый актив</Table.Column>
                                  <Table.Column>Кол-во</Table.Column>
                                  <Table.Column>Валюта</Table.Column>
                                  <Table.Column>Погашение</Table.Column>
                                  <Table.Column>Действие</Table.Column>
                                </Table.Header>
                                <Table.Body>
                                  {filteredPositions.length === 0 ? (
                                    <Table.Row>
                                      <Table.Cell colSpan={7}>
                                        <span className="textMuted">Нет позиций, соответствующих запросу.</span>
                                      </Table.Cell>
                                    </Table.Row>
                                  ) : (
                                    filteredPositions.map((p) => (
                                      <Table.Row key={p.position_id}>
                                        <Table.Cell>{p.position_id}</Table.Cell>
                                        <Table.Cell>{p.instrument_type}</Table.Cell>
                                        <Table.Cell>{p.underlying_symbol}</Table.Cell>
                                        <Table.Cell>{p.quantity}</Table.Cell>
                                        <Table.Cell>{p.currency}</Table.Cell>
                                        <Table.Cell>{p.maturity_date}</Table.Cell>
                                        <Table.Cell>
                                          <button type="button" className="importRowAction" onClick={() => setSelectedRow(p)}>
                                            Открыть
                                          </button>
                                        </Table.Cell>
                                      </Table.Row>
                                    ))
                                  )}
                                </Table.Body>
                              </Table.Content>
                            </Table.ScrollContainer>
                          </Table>
                        </ScrollShadow>
                      </>
                    )}
                  </Tabs.Panel>

                  <Tabs.Panel className="importTabsPanel" id="structure">
                    <div className="importPortfolioKpis">
                      <div className="importPortfolioKpi">
                        <span>Всего</span>
                        <strong>{positions.length}</strong>
                      </div>
                      <div className="importPortfolioKpi">
                        <span>Типов</span>
                        <strong>{mixRows.length}</strong>
                      </div>
                      <div className="importPortfolioKpi">
                        <span>Активов</span>
                        <strong>{uniqueUnderlyings}</strong>
                      </div>
                      <div className="importPortfolioKpi">
                        <span>Валют</span>
                        <strong>{uniqueCurrencies}</strong>
                      </div>
                    </div>

                    <Table variant="secondary">
                      <Table.ScrollContainer>
                        <Table.Content aria-label="Структура и состав портфеля по типам">
                          <Table.Header>
                            <Table.Column isRowHeader>Тип инструмента</Table.Column>
                            <Table.Column>Позиции</Table.Column>
                            <Table.Column>Доля</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {mixRows.length === 0 ? (
                              <Table.Row>
                                <Table.Cell colSpan={3}>
                                  <span className="textMuted">Данные не загружены.</span>
                                </Table.Cell>
                              </Table.Row>
                            ) : (
                              mixRows.map((row) => (
                                <Table.Row key={row.key}>
                                  <Table.Cell>{row.label}</Table.Cell>
                                  <Table.Cell>{row.count}</Table.Cell>
                                  <Table.Cell>
                                    <div className="importShareCell">
                                      <span>{Math.round(row.share)}%</span>
                                      <div className="importMixBarTrack">
                                        <div className="importMixBarFill" style={{ width: `${Math.max(8, Math.round(row.share))}%` }} />
                                      </div>
                                    </div>
                                  </Table.Cell>
                                </Table.Row>
                              ))
                            )}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </Tabs.Panel>
                </Tabs>
              </div>
            </>
          ) : (
            <div className="importEmptyHint">
              <svg className="importEmptyIcon" viewBox="0 0 24 24">
                <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-7H9v-2h6v2zm0 4H9v-2h6v2z"/>
              </svg>
              <div className="importEmptyTitle">Портфель не загружен</div>
              <div className="importEmptyMeta">Перетащите CSV/Excel в зону выше или нажмите на блок «Демо-портфель»</div>
            </div>
          )}
        </div>

      </div>

      {/* ── Position detail drawer ── */}
      <Drawer isOpen={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)} size="md">
        <Drawer.Backdrop className="detailDrawerBackdrop">
          <Drawer.Content placement="right" className="detailDrawer">
            <Drawer.Dialog>
              <Drawer.Header>
                <Drawer.Heading>{selectedRow?.position_id ?? "Позиция"}</Drawer.Heading>
                <Drawer.CloseTrigger className="detailDrawerClose" aria-label="Закрыть карточку позиции" />
              </Drawer.Header>
              <Drawer.Body>
                {selectedRow && (
                  <div className="detailDrawerBody">
                    <div><span>Тип</span><strong>{selectedRow.instrument_type}</strong></div>
                    <div><span>Базовый актив</span><strong>{selectedRow.underlying_symbol}</strong></div>
                    <div><span>Кол-во</span><strong>{selectedRow.quantity}</strong></div>
                    <div><span>Номинал</span><strong>{selectedRow.notional}</strong></div>
                    <div><span>Цена</span><strong>{selectedRow.underlying_price}</strong></div>
                    <div><span>Страйк</span><strong>{selectedRow.strike}</strong></div>
                    <div><span>Волатильность</span><strong>{selectedRow.volatility}</strong></div>
                    <div><span>Дата оценки</span><strong>{selectedRow.valuation_date}</strong></div>
                    <div><span>Дата погашения</span><strong>{selectedRow.maturity_date}</strong></div>
                  </div>
                )}
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    </div>
  );
}
