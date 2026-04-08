import { ReactNode, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  Input,
  Pagination,
  Progress,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Tooltip,
} from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { uploadMarketDataBundleFile } from "../api/endpoints";
import Button from "../components/Button";
import Checklist from "../components/Checklist";
import ConfirmDialog from "../components/ConfirmDialog";
import FileDropzone from "../components/FileDropzone";
import Card from "../ui/Card";
import { ImportLogEntry, PositionDTO } from "../api/types";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { useAppData } from "../state/appDataStore";
import { isMarketDataBundleFile } from "../lib/marketDataFiles";
import { demoPositions } from "../mock/demoData";
import { parsePortfolioCsv } from "../validation/portfolioCsv";
import { CompareBarsChart, GlassPanel, Reveal, Sparkline, StaggerGroup, StaggerItem } from "../components/rich/RichVisuals";

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
    } catch {
      // ignore invalid encoding
    }
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

function isExcelFile(file: File): boolean {
  return /\.(xlsx|xls)$/i.test(file.name);
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

  return Papa.unparse(normalized, {
    quotes: false,
    delimiter: ",",
    newline: "\n",
    skipEmptyLines: true,
  });
}

async function parsePortfolioExcelFromFile(file: File) {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name];
    return sheet && Object.keys(sheet).length > 0;
  });

  if (!sheetName) {
    throw new Error("Excel-файл не содержит листов с данными.");
  }

  const sheet = workbook.Sheets[sheetName];
  const text = toCsvTextFromSheet(sheet);

  if (!text.trim()) {
    throw new Error(`Лист "${sheetName}" не содержит данных.`);
  }

  return parsePortfolioCsv(text);
}

async function parsePortfolioFile(file: File) {
  if (isExcelFile(file)) {
    return parsePortfolioExcelFromFile(file);
  }
  return parsePortfolioCsvFromFile(file);
}

function positionStats(positions: PositionDTO[]) {
  const byType = new Map<string, number>();
  positions.forEach((position) => {
    byType.set(position.instrument_type, (byType.get(position.instrument_type) ?? 0) + 1);
  });
  return Array.from(byType.entries());
}

export default function ImportPage() {
  const nav = useNavigate();
  const { state: wf, dispatch } = useWorkflow();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const [isLoading, setLoading] = useState(false);
  const [lastFilename, setLastFilename] = useState<string | undefined>(undefined);
  const [marketDataNotice, setMarketDataNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<PositionDTO | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
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

      if (positions.length > 0) {
        dispatch({ type: "SET_SNAPSHOT", snapshotId: crypto.randomUUID() });
        dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Import });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось прочитать файл портфеля.";
      const log: ImportLogEntry[] = [{ severity: "ERROR", field: "file", message }];
      dataDispatch({ type: "SET_PORTFOLIO", positions: [], source: "csv", filename: file.name });
      dataDispatch({ type: "SET_VALIDATION_LOG", log });
      dispatch({ type: "RESET_ALL" });
      dispatch({ type: "SET_VALIDATION", criticalErrors: 1, warnings: 0, acknowledged: false });
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
      dispatch({
        type: "SET_MARKET_STATUS",
        missingFactors,
        status: summary.ready ? "ready" : "idle",
      });
      if (summary.ready) {
        dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.MarketData });
      }

      setMarketDataNotice(`Файл ${file.name} распознан как рыночные данные и добавлен в market data bundle.`);
      if (wf.completedSteps.includes(WorkflowStep.Validate)) {
        nav("/market");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `Не удалось передать ${file.name} в market data bundle.`;
      setMarketDataNotice(message);
      dispatch({ type: "SET_MARKET_STATUS", missingFactors: wf.marketData.missingFactors, status: "idle" });
    } finally {
      setLoading(false);
    }
  };

  const positions = dataState.portfolio.positions;
  const log = dataState.validationLog;
  const hasSomethingToLose = positions.length > 0 || Boolean(dataState.results.metrics);
  const criticalErrors = useMemo(() => log.filter((x) => x.severity === "ERROR").length, [log]);
  const warnings = useMemo(() => log.filter((x) => x.severity === "WARNING").length, [log]);
  const readyRatio = positions.length === 0 ? 0 : Math.max(0, Math.min(100, ((positions.length - criticalErrors) / positions.length) * 100));
  const sourceLabel = positions.length === 0 && !dataState.portfolio.filename ? "Новая сессия" : dataState.portfolio.source.toUpperCase();

  const filteredPositions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return positions;
    return positions.filter((position) =>
      [position.position_id, position.underlying_symbol, position.instrument_type, position.currency]
        .filter(Boolean)
        .some((part) => String(part).toLowerCase().includes(query))
    );
  }, [positions, search]);

  const stats = useMemo(() => positionStats(positions), [positions]);
  const previewPageSize = 8;
  const pagedPositions = useMemo(
    () => filteredPositions.slice((previewPage - 1) * previewPageSize, previewPage * previewPageSize),
    [filteredPositions, previewPage]
  );
  const previewPages = Math.max(1, Math.ceil(filteredPositions.length / previewPageSize));
  const statChartData = useMemo(
    () => stats.map(([label, count]) => ({ label, value: count, tone: "positive" as const })),
    [stats]
  );
  const readinessSeries = useMemo(
    () => [
      { label: "Файл", value: positions.length > 0 ? 92 : 18 },
      { label: "Ошибки", value: Math.max(0, 100 - criticalErrors * 20) },
      { label: "Валидность", value: Math.max(0, 100 - warnings * 8) },
      { label: "Готовность", value: readyRatio },
    ],
    [criticalErrors, positions.length, readyRatio, warnings]
  );

  useEffect(() => {
    if (previewPage > previewPages) setPreviewPage(1);
  }, [previewPage, previewPages]);

  useEffect(() => {
    if (!dataState.portfolio.filename && dataState.portfolio.positions.length === 0) {
      setLastFilename(undefined);
      setSelectedRow(null);
    }
  }, [dataState.portfolio.filename, dataState.portfolio.positions.length]);

  return (
    <Card>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? null}
        confirmText={confirm?.confirmText ?? "Продолжить"}
        danger={confirm?.danger ?? false}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.action();
          setConfirm(null);
        }}
      />

      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Импорт портфеля</h1>
          <p className="pageHint">
            Один экран для загрузки, первичной проверки и быстрого просмотра того, что реально попадёт в расчёт.
          </p>
        </div>
        <div className="pageActions">
          <Chip color={criticalErrors > 0 ? "danger" : warnings > 0 ? "warning" : "success"} variant="flat" radius="sm">
            {criticalErrors > 0 ? "Есть ошибки" : warnings > 0 ? "Есть предупреждения" : "Вход корректен"}
          </Chip>
          <Button
            variant="secondary"
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
            Демо
          </Button>
        </div>
      </div>

      <div className="importLayout">
        <div className="importMain">
          <StaggerGroup className="visualBentoGrid">
            <StaggerItem>
              <Card className="importUploadCard">
                <div className="importUploadHeader">
                  <div>
                    <div className="cardTitle">Загрузка файла</div>
                    <div className="cardSubtitle">Поддерживаются CSV, XLSX, XLS. Достаточно одного файла.</div>
                  </div>
                  <div className="importTemplateLinks">
                    <a className="btn btn-secondary" href="/sample_portfolio.csv" download>
                      Шаблон CSV
                    </a>
                    <a className="btn btn-secondary" href="/sample_portfolio.xlsx" download>
                      Шаблон XLSX
                    </a>
                  </div>
                </div>

              <FileDropzone
                  accept=".csv,.xlsx,.xls"
                  inputTestId="portfolio-file"
                  disabled={isLoading}
                  title={isLoading ? "Читаем файл..." : "Перетащите сюда файл портфеля"}
                  subtitle="или нажмите, чтобы выбрать файл"
                  onFile={(file) => {
                    if (isMarketDataBundleFile(file.name)) {
                      return handoffMarketDataFile(file);
                    }
                    const go = () => importFile(file);
                    if (!hasSomethingToLose) return go();
                    setConfirm({
                      title: "Заменить текущий портфель?",
                      description: (
                        <div className="stack">
                          <div>
                            Файл <span className="code">{file.name}</span> заменит текущие данные.
                          </div>
                          <div className="textMuted">Результаты расчёта будут сброшены.</div>
                        </div>
                      ),
                      confirmText: "Загрузить файл",
                      action: go,
                    });
                  }}
                />

                <div className="importMetaRow">
                  <Chip variant="flat" radius="sm">{sourceLabel}</Chip>
                  <span className="textMuted">Последний файл: {lastFilename ?? dataState.portfolio.filename ?? "—"}</span>
                </div>

                {marketDataNotice && (
                  <Chip
                    color={marketDataNotice.includes("Не удалось") ? "danger" : "success"}
                    variant="flat"
                    radius="sm"
                    className="importIssueChip"
                  >
                    {marketDataNotice}
                  </Chip>
                )}
              </Card>
            </StaggerItem>

            <StaggerItem className="visualBentoStack">
              <GlassPanel
                title="Качество входа"
                subtitle="Радиальный индикатор и sparkline показывают, насколько сессия близка к расчёту."
                badge={<Chip color={criticalErrors > 0 ? "danger" : warnings > 0 ? "warning" : "success"} variant="flat" radius="sm">{readyRatio}%</Chip>}
              >
                <div className="visualSplitPanel">
                  <CircularProgress
                    aria-label="Готовность входных данных"
                    value={readyRatio}
                    color={criticalErrors > 0 ? "danger" : warnings > 0 ? "warning" : "success"}
                    showValueLabel
                    className="importCircularGauge"
                  />
                  <Sparkline data={readinessSeries} color={criticalErrors > 0 ? "#ff7777" : "#6eff8e"} height={120} />
                </div>
              </GlassPanel>

              <GlassPanel
                title="Состав портфеля"
                subtitle="Мини-аналитика без перехода на отдельную страницу."
              >
                {stats.length ? (
                  <CompareBarsChart data={statChartData} height={200} />
                ) : (
                  <Skeleton className="h-[200px] rounded-[18px]" />
                )}
              </GlassPanel>
            </StaggerItem>
          </StaggerGroup>

          <Reveal delay={0.08}>
            <Card>
              <div className="importUploadHeader">
                <div>
                  <div className="cardTitle">Состояние входа</div>
                  <div className="cardSubtitle">Сразу видно, можно ли идти дальше, и где именно проблема.</div>
                </div>
                <Button disabled={positions.length === 0} className="floatingCTA" onClick={() => nav("/validate")}>
                  К проверке данных
                </Button>
              </div>

              <div className="importKpiGrid">
                <div className="importKpiCard">
                  <span>Позиции</span>
                  <strong>{positions.length}</strong>
                </div>
                <div className="importKpiCard">
                  <span>Ошибки</span>
                  <strong className={criticalErrors > 0 ? "isNegative" : ""}>{criticalErrors}</strong>
                </div>
                <div className="importKpiCard">
                  <span>Предупреждения</span>
                  <strong>{warnings}</strong>
                </div>
              </div>

              <Progress
                aria-label="Готовность входных данных"
                value={readyRatio}
                color={criticalErrors > 0 ? "danger" : warnings > 0 ? "warning" : "success"}
                className="importProgress"
              />

              <Checklist
                items={[
                  { label: `Позиции считаны: ${positions.length}`, done: positions.length > 0 },
                  { label: `Критических ошибок: ${criticalErrors}`, done: criticalErrors === 0 },
                  { label: `Предупреждений: ${warnings}`, done: true, hint: warnings ? "Можно продолжать после просмотра" : undefined },
                ]}
              />
            </Card>
          </Reveal>

          <Reveal delay={0.12}>
            <Card>
              <div className="importPreviewHeader">
                <div>
                  <div className="cardTitle">Быстрый просмотр</div>
                  <div className="cardSubtitle">Поиск по коду позиции, базовому активу, типу или валюте.</div>
                </div>
                <Input
                  aria-label="Поиск по позициям"
                  placeholder="Найти позицию"
                  value={search}
                  onValueChange={setSearch}
                  size="sm"
                  classNames={{ inputWrapper: "importSearchField" }}
                />
              </div>

              <Tabs
                aria-label="Просмотр входных данных"
                radius="sm"
                color="primary"
                classNames={{
                  tabList: "importTabsList",
                  tab: "importTab",
                  cursor: "importTabCursor",
                  panel: "importTabPanel",
                }}
              >
                <Tab key="positions" title={`Позиции (${filteredPositions.length})`}>
                  <Table
                    removeWrapper
                    aria-label="Предпросмотр портфеля"
                    classNames={{
                      table: "heroTable",
                      th: "heroTableHeader",
                      td: "heroTableCell",
                      tr: "heroTableRow",
                    }}
                  >
                    <TableHeader>
                      <TableColumn>ID</TableColumn>
                      <TableColumn>Тип</TableColumn>
                      <TableColumn>Базовый актив</TableColumn>
                      <TableColumn>Кол-во</TableColumn>
                      <TableColumn>Валюта</TableColumn>
                      <TableColumn>Погашение</TableColumn>
                    </TableHeader>
                    <TableBody emptyContent="Пока нет загруженных позиций.">
                      {pagedPositions.map((position) => (
                        <TableRow key={position.position_id} onClick={() => setSelectedRow(position)}>
                          <TableCell>{position.position_id}</TableCell>
                          <TableCell>{position.instrument_type}</TableCell>
                          <TableCell>{position.underlying_symbol}</TableCell>
                          <TableCell>{position.quantity}</TableCell>
                          <TableCell>{position.currency}</TableCell>
                          <TableCell>{position.maturity_date}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredPositions.length > previewPageSize ? (
                    <div className="pageSection inlineActions">
                      <Pagination
                        page={previewPage}
                        total={previewPages}
                        onChange={setPreviewPage}
                        size="sm"
                        showControls
                        color="primary"
                        variant="flat"
                      />
                      <Tooltip content="Клик по строке открывает drawer с деталями позиции.">
                        <Chip size="sm" variant="flat" radius="sm">
                          {filteredPositions.length} строк
                        </Chip>
                      </Tooltip>
                    </div>
                  ) : null}
                </Tab>

                <Tab key="structure" title="Структура портфеля">
                  <div className="importStatList">
                    {stats.length === 0 ? (
                      <div className="textMuted">Структура появится после загрузки портфеля.</div>
                    ) : (
                      <CompareBarsChart data={statChartData} height={220} />
                    )}
                  </div>
                </Tab>

                <Tab key="issues" title={`Замечания (${log.length})`}>
                  <div className="importIssues">
                    {log.length === 0 ? (
                      <div className="textMuted">Замечаний нет. Можно идти дальше.</div>
                    ) : (
                      log.slice(0, 10).map((entry, index) => (
                        <Chip
                          key={`${entry.message}-${index}`}
                          color={entry.severity === "ERROR" ? "danger" : entry.severity === "WARNING" ? "warning" : "success"}
                          variant="flat"
                          radius="sm"
                          className="importIssueChip"
                        >
                          {entry.row ? `Строка ${entry.row}: ` : ""}{entry.message}
                        </Chip>
                      ))
                    )}
                  </div>
                </Tab>
              </Tabs>
            </Card>
          </Reveal>
        </div>

        <aside className="importAside">
          <Card>
            <div className="cardTitle">Что дальше</div>
            <div className="cardSubtitle">Порядок действий после загрузки.</div>
            <Divider className="importAsideDivider" />
            <Checklist
              items={[
                { label: "Просмотреть ошибки и предупреждения", done: criticalErrors === 0 && warnings === 0 },
                { label: "Проверить состав портфеля", done: positions.length > 0 },
                { label: "Перейти к шагу валидации", done: false },
              ]}
            />
          </Card>

          <Card>
            <div className="cardTitle">Поддерживаемый формат</div>
            <div className="cardSubtitle">Минимум, который нужен для расчёта.</div>
            <ul className="importFieldList">
              <li><span className="code">instrument_type</span></li>
              <li><span className="code">position_id</span></li>
              <li><span className="code">quantity</span></li>
              <li><span className="code">notional</span></li>
              <li><span className="code">underlying_symbol</span></li>
              <li><span className="code">currency</span></li>
            </ul>
          </Card>
        </aside>
      </div>

      <Drawer
        isOpen={Boolean(selectedRow)}
        onOpenChange={(open) => !open && setSelectedRow(null)}
        placement="right"
        size="md"
        classNames={{ base: "detailDrawer", backdrop: "detailDrawerBackdrop" }}
      >
        <DrawerContent>
          <DrawerHeader>{selectedRow?.position_id ?? "Позиция"}</DrawerHeader>
          <DrawerBody>
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
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Card>
  );
}
