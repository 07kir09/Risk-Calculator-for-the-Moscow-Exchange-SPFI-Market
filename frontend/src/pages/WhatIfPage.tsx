import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import Card from "../ui/Card";
import { runRiskCalculation } from "../api/services/risk";
import { PositionDTO } from "../api/types";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { formatNumber } from "../utils/format";

type HedgeDraft = {
  title: string;
  rationale: string;
  position: PositionDTO;
};

type PositionEdits = Record<string, { quantity?: number; notional?: number }>;

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WhatIfPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { state: dataState } = useAppData();
  const { state: wf } = useWorkflow();

  const baseMetrics = dataState.results.metrics;
  const basePositions = dataState.portfolio.positions;
  const scenarios = dataState.scenarios;

  const [edits, setEdits] = useState<PositionEdits>({});
  const [added, setAdded] = useState<PositionDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [editQuantity, setEditQuantity] = useState<number | "">("");
  const [editNotional, setEditNotional] = useState<number | "">("");
  const [afterMetrics, setAfterMetrics] = useState<typeof baseMetrics>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: ReactNode;
    confirmText?: string;
    danger?: boolean;
    action: () => void;
  } | null>(null);

  useEffect(() => {
    const st: any = location.state;
    const draft = st?.hedgeDraft as HedgeDraft | undefined;
    if (!draft?.position) return;
    setAdded((prev) => [...prev, draft.position]);
    nav("/what-if", { replace: true, state: {} });
  }, [location.state, nav]);

  const afterPositions = useMemo(() => {
    const edited = basePositions.map((p) => {
      const e = edits[p.position_id];
      return e ? { ...p, ...e } : p;
    });
    return [...edited, ...added];
  }, [basePositions, edits, added]);

  const compareRows = useMemo(() => {
    const before = baseMetrics;
    const after = afterMetrics;
    const unit = before?.base_currency ?? dataState.portfolio.positions[0]?.currency;
    const rows: Array<{ key: string; label: string; unit?: string; before?: number | null; after?: number | null }> = [
      { key: "base_value", label: "Стоимость портфеля", unit, before: before?.base_value, after: after?.base_value },
      { key: "var_hist", label: "VaR (hist)", unit, before: before?.var_hist, after: after?.var_hist },
      { key: "es_hist", label: "ES (hist)", unit, before: before?.es_hist, after: after?.es_hist },
      { key: "lc_var", label: "LC VaR", unit, before: before?.lc_var, after: after?.lc_var },
      { key: "delta", label: "Delta", before: before?.greeks?.delta, after: after?.greeks?.delta },
      { key: "vega", label: "Vega", before: before?.greeks?.vega, after: after?.greeks?.vega },
      { key: "dv01", label: "DV01", before: before?.greeks?.dv01, after: after?.greeks?.dv01 },
      { key: "initial_margin", label: "Initial Margin", unit, before: before?.initial_margin, after: after?.initial_margin },
    ];
    return rows;
  }, [afterMetrics, baseMetrics, dataState.portfolio.positions]);

  if (!baseMetrics) {
    return (
      <Card>
        <h1 className="pageTitle">Песочница “Что если”</h1>
        <p className="pageHint">Сначала нужен базовый расчёт. Запустите расчёт и вернитесь сюда.</p>
        <Button onClick={() => nav("/run")}>Перейти к запуску</Button>
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
          <h1 className="pageTitle">Песочница “Что если”</h1>
          <p className="pageHint">
            Здесь вы меняете <strong>копию</strong> портфеля и сравниваете риск “до/после”. Исходный портфель не трогаем.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/actions")}>Назад</Button>
          <Button
            variant="secondary"
            onClick={() => downloadJson("what_if_changes.json", { edits, added })}
            disabled={Object.keys(edits).length === 0 && added.length === 0}
          >
            Скачать изменения (JSON)
          </Button>
          <Button
            variant="secondary"
            disabled={Object.keys(edits).length === 0 && added.length === 0}
            onClick={() =>
              setConfirm({
                title: "Сбросить изменения?",
                description: "Все изменения в песочнице будут удалены.",
                confirmText: "Сбросить",
                danger: true,
                action: () => {
                  setEdits({});
                  setAdded([]);
                  setAfterMetrics(null);
                  setErrorText(null);
                },
              })
            }
          >
            Сбросить
          </Button>
        </div>
      </div>

      {errorText && (
        <div className="badge danger pageSection--tight">
          {errorText}
        </div>
      )}

      <div className="grid pageSection--tight">
        <Card>
          <div className="cardTitle">1) Изменить существующую сделку</div>
          <div className="cardSubtitle">Выберите сделку и задайте новое количество/номинал.</div>
          <div className="stack pageSection--tight">
            <label>
              ID сделки
              <input
                list="positions"
                placeholder="Начните печатать (например, call_eu)…"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              />
              <datalist id="positions">
                {basePositions.slice(0, 2000).map((p) => (
                  <option key={p.position_id} value={p.position_id} />
                ))}
              </datalist>
            </label>
            <div className="inputPairGrid">
              <label>
                Кол-во (quantity)
                <input type="number" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value === "" ? "" : Number(e.target.value))} />
              </label>
              <label>
                Номинал (notional)
                <input type="number" value={editNotional} onChange={(e) => setEditNotional(e.target.value === "" ? "" : Number(e.target.value))} />
              </label>
            </div>
            <div className="inlineActions">
              <Button
                variant="secondary"
                disabled={
                  !selectedId ||
                  !(
                    (editQuantity !== "" && Number.isFinite(editQuantity)) ||
                    (editNotional !== "" && Number.isFinite(editNotional))
                  )
                }
                onClick={() => {
                  const exists = basePositions.some((p) => p.position_id === selectedId);
                  if (!exists) {
                    setErrorText(`Сделка "${selectedId}" не найдена. Выберите ID из списка.`);
                    return;
                  }
                  setErrorText(null);
                  const qtyOk = editQuantity !== "" && Number.isFinite(editQuantity);
                  const notionalOk = editNotional !== "" && Number.isFinite(editNotional);
                  setEdits((prev) => ({
                    ...prev,
                    [selectedId]: {
                      ...(qtyOk ? { quantity: editQuantity } : {}),
                      ...(notionalOk ? { notional: editNotional } : {}),
                    },
                  }));
                  setEditQuantity("");
                  setEditNotional("");
                }}
              >
                Применить изменение
              </Button>
              <Button
                variant="ghost"
                disabled={!selectedId || edits[selectedId] === undefined}
                onClick={() => {
                  setErrorText(null);
                  setEdits((prev) => {
                    const next = { ...prev };
                    delete next[selectedId];
                    return next;
                  });
                }}
              >
                Удалить изменение
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="cardTitle">2) Добавленные сделки (хеджи)</div>
          <div className="cardSubtitle">Сюда попадают подсказки из раздела “Хедж”. Можно удалить.</div>
          {added.length === 0 ? (
            <div className="textMuted pageSection--tight">
              Пока ничего не добавлено. Откройте <Button variant="ghost" onClick={() => nav("/hedge")}>подсказки по хеджу</Button>.
            </div>
          ) : (
            <div className="table-wrap pageSection--tight">
              <table className="table sticky">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Тип</th>
                    <th>Кол-во</th>
                    <th>Номинал</th>
                    <th>Базовый</th>
                    <th>Страйк/фикс</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {added.map((p) => (
                    <tr key={p.position_id}>
                      <td>{p.position_id}</td>
                      <td>{p.instrument_type}</td>
                      <td title={String(p.quantity)}>{formatNumber(p.quantity, 6)}</td>
                      <td title={String(p.notional)}>{formatNumber(p.notional, 6)}</td>
                      <td>{p.underlying_symbol}</td>
                      <td title={String(p.strike)}>{formatNumber(p.strike, 6)}</td>
                      <td className="tableActionCell">
                        <Button
                          variant="ghost"
                          onClick={() => setAdded((prev) => prev.filter((x) => x.position_id !== p.position_id))}
                        >
                          Удалить
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="pageHeader">
          <div>
            <div className="cardTitle">3) Рассчитать “после” и сравнить</div>
            <div className="cardSubtitle">Мы пересчитаем те же метрики, что и в основном расчёте.</div>
          </div>
          <div className="inlineActions">
            <Button
              loading={isRunning}
              disabled={isRunning}
              onClick={async () => {
                setErrorText(null);
                setIsRunning(true);
                try {
                  const alpha = Number(wf.calcConfig.params?.alpha ?? 0.99);
                  const horizonDays = Number(wf.calcConfig.params?.horizonDays ?? 10);
                  const parametricTailModel = String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher");
                  const baseCurrency = String(wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase();
                  const fxRates = (wf.calcConfig.params?.fxRates as Record<string, number> | undefined) ?? undefined;
                  const liquidityModel = String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value");
                  const metrics = await runRiskCalculation({
                    positions: afterPositions,
                    scenarios,
                    limits: dataState.limits ?? undefined,
                    alpha,
                    horizonDays,
                    parametricTailModel,
                    baseCurrency,
                    fxRates,
                    liquidityModel,
                    selectedMetrics: wf.calcConfig.selectedMetrics,
                    marginEnabled: wf.calcConfig.marginEnabled,
                    marketDataSessionId: dataState.marketDataSummary?.session_id,
                  });
                  setAfterMetrics(metrics);
                } catch (e: any) {
                  setErrorText(e?.message ?? "Не удалось пересчитать портфель");
                } finally {
                  setIsRunning(false);
                }
              }}
            >
              Пересчитать “после”
            </Button>
          </div>
        </div>

        <div className="table-wrap pageSection--tight">
          <table className="table sticky">
            <thead>
              <tr>
                <th>Метрика</th>
                <th>До</th>
                <th>После</th>
                <th>Изменение</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((r) => {
                const hasBefore = r.before !== undefined && r.before !== null;
                const hasAfter = r.after !== undefined && r.after !== null;
                const beforeValue: number | undefined = hasBefore ? (r.before as number) : undefined;
                const afterValue: number | undefined = hasAfter ? (r.after as number) : undefined;
                const diff = afterValue !== undefined && beforeValue !== undefined ? afterValue - beforeValue : undefined;
                return (
                  <tr key={r.key}>
                    <td>{r.label}{r.unit ? ` (${r.unit})` : ""}</td>
                    <td title={beforeValue !== undefined ? String(beforeValue) : undefined}>{beforeValue !== undefined ? formatNumber(beforeValue) : "—"}</td>
                    <td title={afterValue !== undefined ? String(afterValue) : undefined}>{afterValue !== undefined ? formatNumber(afterValue) : "—"}</td>
                    <td title={diff !== undefined ? String(diff) : undefined}>{diff !== undefined ? formatNumber(diff) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="textMuted statusMessage--compact">
          Точное значение всегда доступно по наведению (tooltip) или через экспорт JSON.
        </div>
      </Card>
    </Card>
  );
}
