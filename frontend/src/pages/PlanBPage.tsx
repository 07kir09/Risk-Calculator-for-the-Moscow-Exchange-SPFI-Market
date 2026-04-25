import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppCheckbox from "../components/AppCheckbox";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { formatNumber } from "../utils/format";

type Task = { id: string; text: string; done: boolean };
type Plan = {
  id: string;
  title: string;
  severity: "ok" | "warn" | "danger";
  summary: string;
  actions: Array<{ label: string; to: string }>;
  tasks: Task[];
};

function loadDoneMap(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export default function PlanBPage() {
  const nav = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf } = useWorkflow();
  const m = dataState.results.metrics;

  const storageKey = useMemo(() => `plan_b_done_${wf.calcRun.calcRunId ?? "no_run"}`, [wf.calcRun.calcRunId]);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>(() => loadDoneMap(storageKey));
  const [confirm, setConfirm] = useState<{
    title: string;
    description: ReactNode;
    confirmText?: string;
    danger?: boolean;
    action: () => void;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(doneMap));
  }, [doneMap, storageKey]);

  const breaches = useMemo(() => {
    const list = m?.limits ?? [];
    return list.filter((x) => x[3]);
  }, [m?.limits]);

  const worstStress = useMemo(() => {
    if (!m?.stress?.length) return undefined;
    return Math.min(...m.stress.map((s) => s.pnl));
  }, [m?.stress]);

  const plans = useMemo<Plan[]>(() => {
    if (!m) return [];
    const base: Plan[] = [];

    if (breaches.length > 0) {
      base.push({
        id: "limits_breach",
        title: "Есть превышение лимитов",
        severity: "danger",
        summary: `Превышено: ${breaches.map((b) => b[0]).slice(0, 3).join(", ")}${breaches.length > 3 ? "…" : ""}`,
        actions: [
          { label: "Открыть лимиты", to: "/limits" },
          { label: "Открыть стрессы", to: "/stress" },
          { label: "Подсказки по хеджу", to: "/hedge" },
        ],
        tasks: [
          { id: "t1", text: "Открыть лимиты и посмотреть, что именно превышено", done: false },
          { id: "t2", text: "Посмотреть вклад сделок/факторов в превышение", done: false },
          { id: "t3", text: "Запустить стресс‑сценарии и сравнить с лимитами", done: false },
          { id: "t4", text: "Оценить вариант хеджа и зафиксировать решение", done: false },
          { id: "t5", text: "Зафиксировать решение: уменьшить позицию / поставить лимит / добавить хедж", done: false },
        ],
      });
    }

    if (worstStress !== undefined && worstStress < 0) {
      base.push({
        id: "stress_loss",
        title: "Плохой стресс‑сценарий даёт убыток",
        severity: worstStress < -Math.abs((m?.initial_margin ?? 0) || 0) ? "danger" : "warn",
        summary: `Худший стресс P&L: ${formatNumber(worstStress)} (${dataState.portfolio.positions[0]?.currency ?? ""})`,
        actions: [
          { label: "Открыть стрессы", to: "/stress" },
          { label: "Открыть панель", to: "/dashboard" },
        ],
        tasks: [
          { id: "s1", text: "Открыть стрессы и посмотреть худший сценарий", done: false },
          { id: "s2", text: "Проверить «топ‑вкладчиков» в убыток", done: false },
          { id: "s3", text: "Проверить, какие факторы двигают риск (цена/вола/ставка)", done: false },
          { id: "s4", text: "Сформулировать действие: уменьшить позицию, поднять лимит или добавить хедж", done: false },
        ],
      });
    }

    if (base.length === 0) {
      base.push({
        id: "all_ok",
        title: "Сигналов тревоги нет",
        severity: "ok",
        summary: "Лимиты не превышены (по доступным метрикам), стресс‑убытки не критичны.",
        actions: [
          { label: "Открыть панель", to: "/dashboard" },
          { label: "Открыть экспорт", to: "/export" },
        ],
        tasks: [
          { id: "o1", text: "Проверить, что данные актуальны (дата оценки/портфель)", done: false },
          { id: "o2", text: "Сохранить отчёт (Excel) для фиксации результата", done: false },
        ],
      });
    }

    return base;
  }, [breaches, dataState.portfolio.positions, m, worstStress]);

  if (!m) {
    return (
      <Card>
        <h1 className="pageTitle">План действий (Plan B)</h1>
        <p className="pageHint">Пока нет результатов. Сначала запустите расчёт.</p>
        <Button onClick={() => nav("/dashboard")}>Перейти к результатам</Button>
      </Card>
    );
  }

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
          <h1 className="pageTitle">План действий (Plan B)</h1>
          <p className="pageHint">Чек‑лист на случай проблем. Здесь нет “умных слов”: только что сделать и куда нажать.</p>
        </div>
        <div className="pageActions">
          <Button
            variant="secondary"
            onClick={() =>
              setConfirm({
                title: "Сбросить все галочки?",
                description: "Это удалит отметки выполнения для текущего расчёта.",
                confirmText: "Сбросить",
                danger: true,
                action: () => setDoneMap({}),
              })
            }
          >
            Сбросить галочки
          </Button>
          <Button variant="secondary" onClick={() => nav("/export")}>Назад</Button>
        </div>
      </div>

      <div className="grid pageSection--tight">
        {plans.map((p) => (
          <Card key={p.id}>
            <div className="splitHeaderRow">
              <div className="cardTitle">{p.title}</div>
              <span className={`badge ${p.severity}`}>{p.severity === "danger" ? "Важно" : p.severity === "warn" ? "Внимание" : "Ок"}</span>
            </div>
            <div className="cardSubtitle statusMessage--compact">{p.summary}</div>
            <div className="inlineActions pageSection--tight">
              {p.actions.map((a) => (
                <Button key={a.to} variant="secondary" onClick={() => nav(a.to)}>{a.label}</Button>
              ))}
            </div>
            <div className="stack pageSection--tight">
              {p.tasks.map((t) => {
                const key = `${p.id}:${t.id}`;
                const done = doneMap[key] ?? false;
                return (
                  <div key={key} className="checkRow">
                    <AppCheckbox
                      id={`plan-task-${p.id}-${t.id}`}
                      isSelected={done}
                      onChange={(checked) => setDoneMap((prev) => ({ ...prev, [key]: checked }))}
                      size="sm"
                      radius="sm"
                      label={<span className={done ? "checkRowText--done" : ""}>{t.text}</span>}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}
