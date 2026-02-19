import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
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
    example:
      "option,pos_1,1,1,MOEX,RUB,100,95,0.2,2026-12-31,2026-01-01,0.05,call,european",
  };
  const map: Record<string, { title: string; howToFix: string; example: string }> = {
    format_iso: {
      title: "Формат даты/кода",
      howToFix: "Используйте ISO-формат: дата YYYY-MM-DD, валюта из 3 букв (RUB/USD).",
      example: "...,RUB,...,2026-12-31,2026-01-01,...",
    },
    date: {
      title: "Ошибки даты",
      howToFix: "Проверьте, что maturity_date позже valuation_date и обе даты валидны.",
      example: "...,2026-12-31,2026-01-01,...",
    },
    quantity: {
      title: "Ошибки quantity",
      howToFix: "quantity должен быть числом и не равняться 0.",
      example: "...,quantity=10,...",
    },
    volatility: {
      title: "Ошибки volatility",
      howToFix: "Для опциона volatility > 0; для forward/swap_ir volatility >= 0.",
      example: "option,...,volatility=0.25,...",
    },
    currency: {
      title: "Ошибки currency",
      howToFix: "Используйте код ISO 4217 из 3 букв: RUB, USD, EUR.",
      example: "...,currency=RUB,...",
    },
    required: {
      title: "Пропущенные обязательные поля",
      howToFix: "Заполните все обязательные колонки из шаблона CSV.",
      example:
        "instrument_type,position_id,quantity,notional,underlying_symbol,currency,underlying_price,strike,volatility,maturity_date,valuation_date,risk_free_rate,option_type,style",
    },
  };
  return map[key] ?? defaults;
}

function groupByIssue(log: ImportLogEntry[]) {
  const map = new Map<string, ImportLogEntry[]>();
  for (const e of log) {
    const key = issueKey(e);
    map.set(key, [...(map.get(key) ?? []), e]);
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

  useEffect(() => {
    dispatch({ type: "SET_VALIDATION", criticalErrors: critical, warnings, acknowledged: wf.validation.acknowledged && critical === 0 });
  }, [critical, warnings, dispatch]);

  const canContinue = critical === 0 && (warnings === 0 || wf.validation.acknowledged);

  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Шаг 2. Проверка данных</h1>
          <p className="pageHint">
            Здесь мы показываем, что именно не так с файлом. Если есть <strong>критические</strong> ошибки — их нужно исправить в CSV и загрузить заново.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/import")}>
            Вернуться к импорту
          </Button>
          <Button data-testid="download-validation-log" variant="secondary" disabled={log.length === 0} onClick={() => downloadJson("validation_log.json", log)}>
            Скачать лог (JSON)
          </Button>
        </div>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <Card>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <span className="code">Итог проверки</span>
            {critical > 0 ? <span className="badge danger">Исправить</span> : warnings > 0 ? <span className="badge warn">Внимание</span> : <span className="badge ok">Ок</span>}
          </div>
          <div className="stack" style={{ marginTop: 10 }}>
            <div>Сделок в портфеле: <span className="code">{dataState.portfolio.positions.length}</span></div>
            <div>Критических ошибок: <span className="code">{critical}</span></div>
            <div>Предупреждений: <span className="code">{warnings}</span></div>
            {warnings > 0 && critical === 0 && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={wf.validation.acknowledged}
                  onChange={(e) => dispatch({ type: "SET_VALIDATION", criticalErrors: critical, warnings, acknowledged: e.target.checked })}
                  style={{ width: 18, height: 18 }}
                />
                <span>Я понимаю предупреждения и хочу продолжить</span>
              </label>
            )}
          </div>
        </Card>

        <Card>
          <div className="cardTitle">Как исправлять (самое частое)</div>
          <ul className="stack" style={{ margin: 10, paddingLeft: 18 }}>
            <li>Дата: формат <span className="code">YYYY-MM-DD</span>, <span className="code">maturity_date</span> позже <span className="code">valuation_date</span>.</li>
            <li>Валюта: <span className="code">RUB</span>, <span className="code">USD</span> и т.д. (ISO 4217).</li>
            <li>Числа: используйте точку или запятую как разделитель (<span className="code">0.25</span> или <span className="code">0,25</span>).</li>
            <li><span className="code">quantity</span> не должен быть 0 (знак = направление позиции).</li>
          </ul>
        </Card>
      </div>

      <Card>
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="cardTitle">Лог ошибок</div>
            <div className="cardSubtitle">Группировка по типам проблем + как исправить.</div>
          </div>
          <div className="row wrap">
            <a className="btn btn-secondary" href="/sample_portfolio.csv" download>
              Скачать шаблон CSV
            </a>
            <Button
              data-testid="go-market"
              disabled={!canContinue}
              onClick={() => {
                dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Validate });
                nav("/market");
              }}
            >
              Продолжить: рыночные данные
            </Button>
          </div>
        </div>

        {log.length === 0 ? (
          <p className="textMuted" style={{ marginTop: 10 }}>
            Ошибок нет — можно продолжать.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            {groupByIssue(log).map(({ key, entries, hint }) => (
              <Card key={key}>
                <div className="row wrap" style={{ justifyContent: "space-between" }}>
                  <div className="cardTitle">{hint.title}</div>
                  <div className="textMuted">{entries.length} шт.</div>
                </div>
                <div className="textMuted" style={{ marginTop: 8 }}>
                  Как исправить: {hint.howToFix}
                </div>
                <div className="textMuted" style={{ marginTop: 6 }}>
                  Пример строки: <span className="code">{hint.example}</span>
                </div>
                <div className="stack" style={{ marginTop: 10 }}>
                  {entries.slice(0, 6).map((e, idx) => (
                    <div key={idx} className={e.severity === "ERROR" ? "badge danger" : e.severity === "WARNING" ? "badge warn" : "badge ok"}>
                      {e.row ? `строка ${e.row}: ` : ""}{e.message}
                    </div>
                  ))}
                  {entries.length > 6 && <div className="textMuted">… и ещё {entries.length - 6}</div>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </Card>
  );
}
