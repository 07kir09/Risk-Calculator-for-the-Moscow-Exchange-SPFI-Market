import { useEffect, useMemo } from "react";
import { Accordion, Chip, ProgressCircle, Separator } from "@heroui/react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import AppCheckbox from "../components/AppCheckbox";
import Button from "../components/Button";
import {
  CircularScore,
  CompareBarsChart,
  Reveal,
} from "../components/rich/RichVisuals";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { ImportLogEntry } from "../api/types";

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function issueKey(entry: ImportLogEntry): string {
  const msg = entry.message.toLowerCase();
  if (msg.includes("iso")) return "format_iso";
  if (msg.includes("дата")) return "date";
  if (msg.includes("quantity") || msg.includes("количество")) return "quantity";
  if (msg.includes("volatility") || msg.includes("волат")) return "volatility";
  if (msg.includes("currency") || msg.includes("валют")) return "currency";
  if (msg.includes("обязательно")) return "required";
  return entry.field ? `field_${entry.field}` : "other";
}

function issueHint(key: string): { title: string; howToFix: string; example: string } {
  const defaults = {
    title: "Прочее",
    howToFix: "Проверьте тип данных и соответствие шаблону CSV.",
    example: "option,pos_1,1,1,MOEX,RUB,100,95,0.2,2026-12-31,2026-01-01,0.05,call,european",
  };
  const map: Record<string, { title: string; howToFix: string; example: string }> = {
    format_iso: {
      title: "Формат даты и кодов",
      howToFix: "Используйте даты в формате YYYY-MM-DD, валюты в формате ISO 4217.",
      example: "...,RUB,...,2026-12-31,2026-01-01,...",
    },
    date: {
      title: "Ошибки дат",
      howToFix: "Дата погашения должна быть позже даты оценки.",
      example: "...,2026-12-31,2026-01-01,...",
    },
    quantity: {
      title: "Ошибки количества",
      howToFix: "quantity должен быть числом и не равняться нулю.",
      example: "...,quantity=10,...",
    },
    volatility: {
      title: "Ошибки волатильности",
      howToFix: "Для опциона volatility > 0; для forward и swap_ir volatility >= 0.",
      example: "option,...,volatility=0.25,...",
    },
    currency: {
      title: "Ошибки валюты",
      howToFix: "Используйте код ISO 4217 из 3 букв: RUB, USD, EUR.",
      example: "...,currency=RUB,...",
    },
    required: {
      title: "Пропущенные обязательные поля",
      howToFix: "Заполните все обязательные колонки шаблона.",
      example: "instrument_type,position_id,quantity,notional,underlying_symbol,currency,...",
    },
  };
  return map[key] ?? defaults;
}

function groupByIssue(log: ImportLogEntry[]) {
  const map = new Map<string, ImportLogEntry[]>();
  for (const entry of log) {
    const key = issueKey(entry);
    map.set(key, [...(map.get(key) ?? []), entry]);
  }
  return Array.from(map.entries())
    .map(([key, entries]) => ({ key, entries, hint: issueHint(key) }))
    .sort((a, b) => b.entries.length - a.entries.length);
}

export default function ValidatePage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf, dispatch } = useWorkflow();

  const log = dataState.validationLog;
  const hasImportAttempt = Boolean(dataState.portfolio.importedAt);
  const critical = useMemo(() => log.filter((x) => x.severity === "ERROR").length, [log]);
  const warnings = useMemo(() => log.filter((x) => x.severity === "WARNING").length, [log]);
  const issueGroups = useMemo(() => groupByIssue(log), [log]);
  const totalPositions = dataState.portfolio.positions.length;
  const hasInvalidImportedPortfolio = hasImportAttempt && totalPositions === 0 && log.length > 0;
  const cleanRows = Math.max(totalPositions - critical - warnings, 0);
  const readyRatio = totalPositions > 0 ? (cleanRows / totalPositions) * 100 : 0;

  const severityChartData = useMemo(
    () => [
      { label: "Ошибки", value: critical, tone: "negative" as const },
      { label: "Предупреждения", value: warnings, tone: "neutral" as const },
      { label: "Чистые", value: cleanRows, tone: "positive" as const },
    ],
    [cleanRows, critical, warnings]
  );

  useEffect(() => {
    dispatch({
      type: "SET_VALIDATION",
      criticalErrors: critical,
      warnings,
      acknowledged: wf.validation.acknowledged && critical === 0,
    });
  }, [critical, warnings, dispatch, wf.validation.acknowledged]);

  const canContinue = critical === 0 && (warnings === 0 || wf.validation.acknowledged);
  const isClean = critical === 0 && warnings === 0;
  const statusColor = critical > 0 ? "danger" : warnings > 0 ? "warning" : totalPositions > 0 ? "success" : "default";
  const statusText = critical > 0 ? `${critical} ошибок` : warnings > 0 ? `${warnings} предупр.` : totalPositions > 0 ? "Данные чистые" : "Нет данных";

  const handleContinue = () => {
    flushSync(() => {
      dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Validate });
    });
    nav("/market");
  };

  return (
    <div className="importPagePlain">

      {/* ── Header ── */}
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Проверка данных</h1>
          <div className="importHeroMeta">
            <Chip color={statusColor} variant="flat" radius="sm" size="sm">{statusText}</Chip>
            {totalPositions > 0 && (
              <span className="importFileTag">{totalPositions} позиций</span>
            )}
          </div>
        </div>

        <div className="validateHeroRight">
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink"
            disabled={!canContinue}
            onClick={handleContinue}
            aria-label="К рыночным данным"
          >
            <span className="importHeroNextLinkText pageTitle">К рыночным данным</span>
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>→</span>
          </button>
          <button
            type="button"
            className="importHeroNextLink validateHeroNavLink validateHeroBackLink"
            onClick={() => nav("/import")}
            aria-label="К импорту"
          >
            <span className="importHeroNextLinkArrow pageTitle" aria-hidden>←</span>
            <span className="importHeroNextLinkText pageTitle">К импорту</span>
          </button>
        </div>
      </div>

      {/* ── Status zone ── */}
      <div className={`importZone${isClean && totalPositions > 0 ? " importZone--loaded" : ""}`}>
        <div className="importUploadSplit">

          {/* Left: adaptive status visual */}
          <div className="validateStatusPane">
            {isClean && totalPositions > 0 ? (
              <div className="validateCleanState">
                <ProgressCircle
                  aria-label="Готовность данных"
                  value={100}
                  color="success"
                  size="lg"
                  showValueLabel
                />
                <div className="validateCleanText">
                  <div className="validateCleanTitle">{totalPositions} строк готовы к расчёту</div>
                  <div className="validateCleanSub">Критических ошибок и предупреждений нет</div>
                </div>
              </div>
            ) : hasInvalidImportedPortfolio ? (
              <div className="validateInvalidImportPane">
                <svg className="validateEmptyIcon" viewBox="0 0 24 24" aria-hidden>
                  <path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 14h-2v-2h2Zm0-4h-2V7h2Z" />
                </svg>
                <div className="validateInvalidImportTitle">Портфель загружен, но файл не прошел проверку</div>
                <div className="validateInvalidImportSub">
                  Найдены критические ошибки в структуре данных. Исправьте файл и загрузите его снова.
                </div>
              </div>
            ) : totalPositions > 0 ? (
              <div className="validateIssueState">
                <CircularScore
                  value={Math.max(0, Math.min(100, readyRatio))}
                  label="Чистые строки"
                  color={statusColor}
                  hint="Доля строк без блокирующих проблем"
                />
                <div className="validateIssueChart">
                  <CompareBarsChart data={severityChartData} height={190} />
                </div>
              </div>
            ) : (
              <div className="validateEmptyPane">
                <svg className="validateEmptyIcon" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41Z"/>
                </svg>
                <div className="validateEmptyTitle">Загрузите портфель</div>
                <div className="validateEmptySub">Перейдите на страницу импорта и загрузите файл</div>
              </div>
            )}
          </div>

          {/* Right: tips tile */}
          <div className="validateTipTile">
            <div className="validateTipTileTop">
              <span className="validateTipEyebrow">Частые причины ошибок</span>
              {issueGroups.length > 0 && (
                <Chip size="sm" color="warning" variant="flat" radius="sm">{issueGroups.length} групп</Chip>
              )}
            </div>
            <div className="validateTipList">
              <div className="validateTipItem">
                <span className="validateTipDot" />
                <span><span className="code">maturity_date</span> позже <span className="code">valuation_date</span></span>
              </div>
              <div className="validateTipItem">
                <span className="validateTipDot" />
                <span><span className="code">currency</span> в формате ISO 4217 (RUB, USD, EUR)</span>
              </div>
              <div className="validateTipItem">
                <span className="validateTipDot" />
                <span><span className="code">quantity</span> не равен нулю</span>
              </div>
              <div className="validateTipItem">
                <span className="validateTipDot" />
                <span><span className="code">volatility</span> заполнена корректно для опциона</span>
              </div>
            </div>
            <div className="validateTipFooter">
              Следующий шаг — рыночные данные для очищенного портфеля.
            </div>
          </div>

        </div>

        {/* Acknowledge block inside zone */}
        {warnings > 0 && critical === 0 && (
          <div className="validateAckZone">
            <AppCheckbox
              id="validate-acknowledged"
              isSelected={wf.validation.acknowledged}
              onChange={(checked) =>
                dispatch({ type: "SET_VALIDATION", criticalErrors: critical, warnings, acknowledged: checked })
              }
              label="Я просмотрел предупреждения и понимаю, что продолжаю с ними"
            />
          </div>
        )}
      </div>

      {/* ── Issues body ── */}
      <div className="importBody">
        <div className="importBodyMain">
          <Reveal delay={0.08}>
            <div className="validateIssuesSection">
              <div className="validateIssuesHeader">
                <div>
                  <div className="cardTitle">Типы проблем</div>
                  <div className="cardSubtitle">Каждый блок показывает, что не так и как это быстро исправить.</div>
                </div>
              </div>

              {log.length === 0 ? (
                <div className="textMuted statusMessage">Ошибок и предупреждений нет. Можно переходить дальше.</div>
              ) : (
                <Accordion variant="splitted" className="validateAccordion">
                  {issueGroups.map(({ key, entries, hint }) => (
                    <Accordion.Item key={key} id={key} className="validateAccordionItem">
                      <Accordion.Heading>
                        <Accordion.Trigger className="validateAccordionTrigger">
                          <div className="validateAccordionTitleBlock">
                            <div className="validateAccordionTitle">
                              <span>{hint.title}</span>
                              <Chip size="sm" variant="flat" radius="sm">{entries.length}</Chip>
                            </div>
                            <div className="cardSubtitle">{hint.howToFix}</div>
                          </div>
                          <Accordion.Indicator />
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel className="validateAccordionContent">
                        <Accordion.Body>
                          <div className="validateHintExample">
                            Пример: <span className="code">{hint.example}</span>
                          </div>
                          <Separator className="importAsideDivider" />
                          <div className="validateEntries">
                            {entries.slice(0, 8).map((entry, idx) => (
                              <Chip
                                key={`${entry.message}-${idx}`}
                                color={entry.severity === "ERROR" ? "danger" : entry.severity === "WARNING" ? "warning" : "success"}
                                variant="flat"
                                radius="sm"
                                className="importIssueChip"
                              >
                                {entry.row ? `Строка ${entry.row}: ` : ""}{entry.message}
                              </Chip>
                            ))}
                          </div>
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              )}
            </div>
          </Reveal>
        </div>
      </div>

      <div className="validateBottomActions">
        <Button variant="secondary" disabled={log.length === 0} onClick={() => downloadJson("validation_log.json", log)}>
          Скачать лог
        </Button>
      </div>

    </div>
  );
}
