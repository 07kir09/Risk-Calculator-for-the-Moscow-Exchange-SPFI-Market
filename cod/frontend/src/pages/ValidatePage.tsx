import { useEffect, useMemo } from "react";
import { Accordion, AccordionItem, Checkbox, Chip, Divider } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import {
  CircularScore,
  CompareBarsChart,
  GlassPanel,
  LineTrendChart,
  Reveal,
  StaggerGroup,
  StaggerItem,
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
  const critical = useMemo(() => log.filter((x) => x.severity === "ERROR").length, [log]);
  const warnings = useMemo(() => log.filter((x) => x.severity === "WARNING").length, [log]);
  const issueGroups = useMemo(() => groupByIssue(log), [log]);
  const cleanRows = Math.max(dataState.portfolio.positions.length - critical - warnings, 0);
  const severityChartData = useMemo(
    () => [
      { label: "Ошибки", value: critical, tone: "negative" as const },
      { label: "Warnings", value: warnings, tone: "neutral" as const },
      { label: "Чистые", value: cleanRows, tone: "positive" as const },
    ],
    [cleanRows, critical, warnings]
  );
  const issueTrendData = useMemo(
    () =>
      (issueGroups.length
        ? issueGroups.slice(0, 6)
        : [
            { hint: { title: "Данные" }, entries: [{ message: "Нет проблем" }] },
            { hint: { title: "Готовность" }, entries: [{ message: "0" }] },
          ]
      ).map((group, index) => ({
        label: group.hint.title.split(" ")[0] ?? `G${index + 1}`,
        value: group.entries.length,
        secondary: Math.max(group.entries.length - 1, 0),
      })),
    [issueGroups]
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

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Проверка данных</h1>
          <p className="pageHint">
            На этом шаге решается только один вопрос: можно ли доверять входу и запускать расчёт дальше.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/import")}>
            Назад к импорту
          </Button>
          <Button variant="secondary" disabled={log.length === 0} onClick={() => downloadJson("validation_log.json", log)}>
            Скачать лог
          </Button>
        </div>
      </div>

      <div className="validateLayout">
        <div className="validateMain">
          <StaggerGroup className="visualSplitPanel">
            <StaggerItem>
              <GlassPanel
                title="Надёжность входа"
                subtitle="Слева мгновенная оценка готовности, справа видно, что именно ломает сессию."
                badge={<Chip color={critical > 0 ? "danger" : warnings > 0 ? "warning" : "success"} variant="flat" radius="sm">{canContinue ? "OK" : "Нужно внимание"}</Chip>}
              >
                <div className="visualSplitPanel">
                  <CircularScore
                    value={dataState.portfolio.positions.length ? Math.max(0, Math.min(100, (cleanRows / dataState.portfolio.positions.length) * 100)) : 0}
                    label="Чистые строки"
                    color={critical > 0 ? "danger" : warnings > 0 ? "warning" : "success"}
                    hint="Доля строк без блокирующих проблем"
                  />
                  <CompareBarsChart data={severityChartData} height={210} />
                </div>
              </GlassPanel>
            </StaggerItem>
            <StaggerItem>
              <GlassPanel
                title="Распределение проблем"
                subtitle="Линейный график показывает, какие группы ошибок сейчас доминируют."
                badge={<Chip color="primary" variant="flat" radius="sm">{issueGroups.length} групп</Chip>}
              >
                <LineTrendChart data={issueTrendData} color="#ff7777" secondaryColor="#7da7ff" showSecondary />
              </GlassPanel>
            </StaggerItem>
          </StaggerGroup>

          <Reveal delay={0.06}>
            <Card>
            <div className="cardTitle">Итог проверки</div>
            <div className="cardSubtitle">Сначала статус, потом причины, потом переход к следующему шагу.</div>

            <div className="validateKpiRow">
              <div className="importKpiCard">
                <span>Позиции</span>
                <strong>{dataState.portfolio.positions.length}</strong>
              </div>
              <div className="importKpiCard">
                <span>Ошибки</span>
                <strong className={critical > 0 ? "isNegative" : ""}>{critical}</strong>
              </div>
              <div className="importKpiCard">
                <span>Предупреждения</span>
                <strong>{warnings}</strong>
              </div>
            </div>

            <div className="validateStatusRow">
              <Chip color={critical > 0 ? "danger" : warnings > 0 ? "warning" : "success"} variant="flat" radius="sm">
                {critical > 0 ? "Нужно исправить файл" : warnings > 0 ? "Можно продолжать с оговорками" : "Всё готово"}
              </Chip>
              {warnings > 0 && critical === 0 && (
                <Checkbox
                  isSelected={wf.validation.acknowledged}
                  onValueChange={(checked) =>
                    dispatch({ type: "SET_VALIDATION", criticalErrors: critical, warnings, acknowledged: checked })
                  }
                >
                  Я просмотрел предупреждения и понимаю, что продолжаю с ними
                </Checkbox>
              )}
            </div>
            </Card>
          </Reveal>

          <Reveal delay={0.1}>
            <Card>
            <div className="validateIssuesHeader">
              <div>
                <div className="cardTitle">Типы проблем</div>
                <div className="cardSubtitle">Каждый блок показывает, что не так и как это быстро исправить.</div>
              </div>
              <Button
                disabled={!canContinue}
                onClick={() => {
                  dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Validate });
                  nav("/market");
                }}
              >
                К рыночным данным
              </Button>
            </div>

            {log.length === 0 ? (
              <div className="textMuted statusMessage">Ошибок и предупреждений нет. Можно переходить дальше.</div>
            ) : (
              <Accordion variant="splitted" className="validateAccordion">
                {issueGroups.map(({ key, entries, hint }) => (
                  <AccordionItem
                    key={key}
                    aria-label={hint.title}
                    title={
                      <div className="validateAccordionTitle">
                        <span>{hint.title}</span>
                        <Chip size="sm" variant="flat" radius="sm">
                          {entries.length}
                        </Chip>
                      </div>
                    }
                    subtitle={hint.howToFix}
                    classNames={{ base: "validateAccordionItem", trigger: "validateAccordionTrigger", content: "validateAccordionContent" }}
                  >
                    <div className="validateHintExample">
                      Пример: <span className="code">{hint.example}</span>
                    </div>
                    <Divider className="importAsideDivider" />
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
                  </AccordionItem>
                ))}
              </Accordion>
            )}
            </Card>
          </Reveal>
        </div>

        <aside className="importAside">
          <Card>
            <div className="cardTitle">Частые причины</div>
            <div className="cardSubtitle">Проверьте эти поля в первую очередь.</div>
            <ul className="importFieldList">
              <li><span className="code">maturity_date</span> позже <span className="code">valuation_date</span></li>
              <li><span className="code">currency</span> в формате ISO 4217</li>
              <li><span className="code">quantity</span> не равен нулю</li>
              <li><span className="code">volatility</span> заполнена корректно</li>
            </ul>
          </Card>

          <Card>
            <div className="cardTitle">Переход дальше</div>
            <div className="cardSubtitle">Следующий шаг подтягивает и проверяет рыночные данные для уже очищенного портфеля.</div>
          </Card>
        </aside>
      </div>
    </Card>
  );
}
