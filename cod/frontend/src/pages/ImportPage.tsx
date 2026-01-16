import { ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Checklist from "../components/Checklist";
import ConfirmDialog from "../components/ConfirmDialog";
import FileDropzone from "../components/FileDropzone";
import Card from "../ui/Card";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { useAppData } from "../state/appDataStore";
import { demoPositions } from "../mock/demoData";
import { parsePortfolioCsv } from "../validation/portfolioCsv";

export default function ImportPage() {
  const nav = useNavigate();
  const { dispatch } = useWorkflow();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const [isLoading, setLoading] = useState(false);
  const [lastFilename, setLastFilename] = useState<string | undefined>(undefined);
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

  const importFile = (file: File) => {
    setLoading(true);
    setLastFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { positions, log } = parsePortfolioCsv(text);

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
      setLoading(false);
    };
    reader.readAsText(file);
  };

  const positions = dataState.portfolio.positions;
  const log = dataState.validationLog;

  const hasSomethingToLose = positions.length > 0 || Boolean(dataState.results.metrics);

  const criticalErrors = useMemo(() => log.filter((x) => x.severity === "ERROR").length, [log]);
  const warnings = useMemo(() => log.filter((x) => x.severity === "WARNING").length, [log]);

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
          <h1 className="pageTitle">Шаг 1. Импорт сделок</h1>
          <p className="pageHint">
            Загрузите CSV с портфелем. Если вы не уверены в формате — скачайте шаблон и заполните его по примеру.
          </p>
        </div>
        <div className="pageActions">
          <Button
            variant="secondary"
            onClick={() => {
              if (!hasSomethingToLose) return doDemo();
              setConfirm({
                title: "Загрузить демо‑портфель?",
                description: (
                  <div className="stack">
                    <div>Это действие заменит текущие сделки и сбросит результаты расчёта.</div>
                    <div className="textMuted">Если хотите сохранить текущие данные — сначала сделайте экспорт (шаг 10).</div>
                  </div>
                ),
                confirmText: "Загрузить демо",
                action: doDemo,
              });
            }}
          >
            Загрузить демо
          </Button>
          <a className="btn btn-secondary" href="/sample_portfolio.csv" download>
            Скачать шаблон CSV
          </a>
        </div>
      </div>

      <div className="grid">
        <Card>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <span className="code">CSV портфеля</span>
            {isLoading ? <span className="badge warn">Читаем файл…</span> : <span className="badge ok">Готово</span>}
          </div>
          <div className="stack" style={{ marginTop: 10 }}>
            <FileDropzone
              accept=".csv"
              inputTestId="portfolio-file"
              disabled={isLoading}
              title="Перетащите CSV с портфелем сюда"
              subtitle="или нажмите, чтобы выбрать файл"
              onFile={(file) => {
                const go = () => importFile(file);
                if (!hasSomethingToLose) return go();
                setConfirm({
                  title: "Заменить текущий портфель?",
                  description: (
                    <div className="stack">
                      <div>
                        Файл <span className="code">{file.name}</span> будет загружен вместо текущих данных.
                      </div>
                      <div className="textMuted">Результаты расчёта будут сброшены.</div>
                    </div>
                  ),
                  confirmText: "Загрузить файл",
                  action: go,
                });
              }}
            />
            <div className="textMuted">
              Поддерживаемые типы: <span className="code">option</span>, <span className="code">forward</span>,{" "}
              <span className="code">swap_ir</span>.
            </div>
            {lastFilename && <div className="textMuted">Последний файл: {lastFilename}</div>}
          </div>
        </Card>
        <Card>
          <div className="row wrap" style={{ justifyContent: "space-between" }}>
            <span className="code">Проверка “на входе”</span>
            {criticalErrors > 0 ? (
              <span className="badge danger">Есть ошибки</span>
            ) : warnings > 0 ? (
              <span className="badge warn">Есть предупреждения</span>
            ) : (
              <span className="badge ok">Ошибок нет</span>
            )}
          </div>
          <Checklist
            items={[
              { label: `Загружено позиций: ${positions.length || 0}`, done: positions.length > 0 },
              { label: `Критических ошибок: ${criticalErrors}`, done: criticalErrors === 0, hint: criticalErrors ? "Нужно исправить CSV" : "Можно продолжать" },
              { label: `Предупреждений: ${warnings}`, done: true, hint: warnings ? "Можно продолжать после подтверждения" : undefined },
            ]}
          />
          <div className="textMuted">
            Подробный список ошибок будет на следующем шаге (“Проверка данных”).
          </div>
        </Card>
      </div>

      <Card>
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="cardTitle">Предпросмотр портфеля</div>
            <div className="cardSubtitle">Показываем первые 50 строк, чтобы страница не “тормозила”.</div>
          </div>
          <Button disabled={positions.length === 0} onClick={() => nav("/validate")}>
            Продолжить: проверка данных
          </Button>
        </div>

        {positions.length === 0 ? (
          <p className="textMuted" style={{ marginTop: 10 }}>
            Пока нет данных. Загрузите CSV или нажмите «Загрузить демо».
          </p>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table sticky">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Тип</th>
                  <th>Кол-во</th>
                  <th>Номинал</th>
                  <th>Базовый</th>
                  <th>Валюта</th>
                  <th>Цена</th>
                  <th>Страйк/фикс</th>
                  <th>Vol</th>
                  <th>Дата погашения</th>
                </tr>
              </thead>
              <tbody>
                {positions.slice(0, 50).map((p) => (
                  <tr key={p.position_id}>
                    <td>{p.position_id}</td>
                    <td>{p.instrument_type}</td>
                    <td>{p.quantity}</td>
                    <td>{p.notional}</td>
                    <td>{p.underlying_symbol}</td>
                    <td>{p.currency}</td>
                    <td>{p.underlying_price}</td>
                    <td>{p.strike}</td>
                    <td>{p.volatility}</td>
                    <td>{p.maturity_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Card>
  );
}
