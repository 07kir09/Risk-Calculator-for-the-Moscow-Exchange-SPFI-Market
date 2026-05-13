import { useEffect, useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import AppTable from "../components/AppTable";
import Button from "../components/Button";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import {
  applyAutoLimits,
  applyLimitConfig,
  buildAutoLimitConfig,
  isDemoDefaultLimitRows,
  isDemoDefaultLimits,
} from "../lib/autoLimits";
import {
  isPreliminaryLimitSource,
  limitSourceDescription,
  limitSourceLabel,
  limitSourceStatus,
} from "../lib/limitSource";
import { attachMethodologyMetadata } from "../lib/methodology";

const METRIC_LABELS: Record<string, string> = {
  var_hist: "Scenario VaR",
  es_hist: "Scenario ES",
  lc_var: "LC VaR",
};

function metricLabel(metric: string) {
  return METRIC_LABELS[metric] ?? metric;
}

function pct(value: number, digits = 1) {
  return `${formatNumber(value, digits)}%`;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export default function LimitsPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { dispatch } = useWorkflow();
  const storedMetrics = dataState.results.metrics;
  const [limitMode, setLimitMode] = useState<"auto" | "manual">("auto");
  const [manualValues, setManualValues] = useState<Record<string, string>>({
    var_hist: "",
    es_hist: "",
    lc_var: "",
  });
  const [manualApproved, setManualApproved] = useState(false);
  const hasManualLimits = useMemo(() => {
    if (!storedMetrics) return false;
    return Boolean(dataState.limits && !isDemoDefaultLimits(dataState.limits) && !isDemoDefaultLimitRows(storedMetrics.limits));
  }, [dataState.limits, storedMetrics]);
  const usesAutoLimits = !hasManualLimits || limitMode === "auto";
  const autoConfig = useMemo(() => (storedMetrics ? buildAutoLimitConfig(storedMetrics) : null), [storedMetrics]);
  const metrics = useMemo(() => {
    if (!storedMetrics) return null;
    if (usesAutoLimits) {
      return attachMethodologyMetadata(applyAutoLimits(storedMetrics), "draft_auto");
    }
    return attachMethodologyMetadata(applyLimitConfig(storedMetrics, dataState.limits), dataState.limitSource ?? "manual_user");
  }, [dataState.limitSource, dataState.limits, storedMetrics, usesAutoLimits]);
  const limits = metrics?.limits || [];
  const effectiveLimitSource = usesAutoLimits ? "draft_auto" : dataState.limitSource ?? "manual_user";
  const preliminaryLimits = isPreliminaryLimitSource(effectiveLimitSource);

  useEffect(() => {
    if (!storedMetrics) return;
    const source = hasManualLimits ? dataState.limits : autoConfig;
    setLimitMode(hasManualLimits ? "manual" : "auto");
    setManualValues({
      var_hist: typeof source?.var_hist === "number" ? String(source.var_hist) : "",
      es_hist: typeof source?.es_hist === "number" ? String(source.es_hist) : "",
      lc_var: typeof source?.lc_var === "number" ? String(source.lc_var) : "",
    });
    setManualApproved(dataState.limitSource === "manual_approved");
  }, [autoConfig, dataState.limitSource, dataState.limits, hasManualLimits, storedMetrics]);

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Limits });
  }, [dispatch, metrics]);

  const limitRows = useMemo(
    () =>
      limits
        .map(([metric, value, limit, breached]) => {
          const absValue = Math.abs(value);
          const absLimit = Math.abs(limit);
          const utilization = absLimit ? (absValue / absLimit) * 100 : 0;
          const effectiveBreach = breached || utilization > 100;
          const headroom = absLimit - absValue;
          const zone = effectiveBreach ? "danger" : utilization >= 85 ? "warning" : "success";
          return {
            metric: String(metric),
            label: metricLabel(String(metric)),
            value,
            limit: absLimit,
            utilization,
            breached: effectiveBreach,
            headroom,
            zone,
          };
        })
        .sort((a, b) => b.utilization - a.utilization),
    [limits]
  );
  const breachedCount = useMemo(() => limitRows.filter((row) => row.breached).length, [limitRows]);
  const overallUtilization = useMemo(
    () => (limitRows.length ? Math.max(...limitRows.map((item) => item.utilization), 0) : 0),
    [limitRows]
  );
  const closestLimit = limitRows[0] ?? null;
  const totalHeadroom = useMemo(
    () => limitRows.reduce((sum, row) => sum + Math.max(row.headroom, 0), 0),
    [limitRows]
  );
  const totalDeficit = useMemo(
    () => limitRows.reduce((sum, row) => sum + Math.max(-row.headroom, 0), 0),
    [limitRows]
  );
  const stressSummary = useMemo(() => {
    const rows = metrics?.stress ?? [];
    const losses = rows.map((row) => (row.pnl < 0 ? Math.abs(row.pnl) : 0));
    const worstLoss = losses.length ? Math.max(...losses) : 0;
    const withLimits = rows.filter((row) => finitePositive(row.limit));
    const breached = withLimits.filter((row) => row.breached || (finitePositive(row.limit) && row.pnl < -Math.abs(row.limit))).length;
    const worstRow = rows.reduce<(typeof rows)[number] | null>((acc, row) => {
      if (!acc) return row;
      return row.pnl < acc.pnl ? row : acc;
    }, null);
    return {
      count: rows.length,
      withLimits: withLimits.length,
      breached,
      worstLoss,
      worstScenario: worstRow?.scenario_id ?? "—",
    };
  }, [metrics?.stress]);
  const statusColor = !metrics
    ? "default"
    : breachedCount + stressSummary.breached > 0
      ? "danger"
      : overallUtilization > 80
        ? "warning"
        : "success";
  const statusText = !metrics
    ? "Нет расчёта"
    : breachedCount + stressSummary.breached > 0
      ? `Превышений: ${breachedCount + stressSummary.breached}`
      : "По текущим порогам без превышений";
  const decision = !metrics
    ? {
        title: "Нет решения",
        text: "Нужен расчёт портфеля, чтобы оценить лимиты.",
        tone: "default",
      }
    : breachedCount > 0 || stressSummary.breached > 0
      ? {
          title: "Требуется действие",
          text: "Есть превышения текущих контрольных порогов. Перед экспортом лучше пересмотреть позиции, пороги или сценарии.",
          tone: "danger",
        }
      : overallUtilization >= 85
        ? {
            title: "Наблюдение",
            text: "Запас есть, но ближайшая метрика уже близко к границе.",
            tone: "warning",
          }
        : {
            title: "Рабочая зона",
            text: "По текущим порогам превышений нет, можно переходить к стрессам или экспорту.",
            tone: "success",
          };
  const sourceText = usesAutoLimits
    ? "Черновые авто-пороги: ориентировочная оценка от масштаба портфеля и текущих риск-метрик. Это не утверждённая risk-policy."
    : "Ручные пользовательские пороги: значения применены к текущему расчёту.";
  const manualConfig = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const key of ["var_hist", "es_hist", "lc_var"] as const) {
      const value = Number(manualValues[key].replace(/\s+/g, "").replace(",", "."));
      if (Number.isFinite(value) && value > 0) out[key] = value;
    }
    return out;
  }, [manualValues]);
  const canApplyManual = ["var_hist", "es_hist", "lc_var"].every((key) => typeof manualConfig[key] === "number");
  const applyManualLimits = () => {
    if (!storedMetrics || !canApplyManual) return;
    const nextSource = manualApproved ? "manual_approved" : "manual_user";
    dataDispatch({ type: "SET_LIMITS", limits: manualConfig, limitSource: nextSource });
    dataDispatch({ type: "SET_RESULTS", metrics: attachMethodologyMetadata(applyLimitConfig(storedMetrics, manualConfig), nextSource) });
    setLimitMode("manual");
  };
  const applyAutoMode = () => {
    if (!storedMetrics) return;
    dataDispatch({ type: "SET_LIMITS", limits: null, limitSource: "draft_auto" });
    dataDispatch({ type: "SET_RESULTS", metrics: attachMethodologyMetadata(applyAutoLimits(storedMetrics), "draft_auto") });
    setManualApproved(false);
    setLimitMode("auto");
  };

  return (
    <div className="importPagePlain dashboardPage dashboardPage--revamp limitsPage">
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Контрольные пороги риска</h1>
          <div className="importHeroMeta">
            <Chip color={statusColor} variant="soft" radius="sm" size="sm">
              {statusText}
            </Chip>
            <span className="importFileTag">Источник: {limitSourceLabel(effectiveLimitSource)}</span>
            <span className="importFileTag">Статус: {limitSourceStatus(effectiveLimitSource)}</span>
            {metrics ? <span className="importFileTag">{limits.length} метрик под контролем</span> : null}
          </div>
        </div>
      </div>

      {!metrics ? (
        <Card>
          <div className="pageEmptyState">
            <div className="badge warn">Результатов ещё нет. Сначала запустите расчёт.</div>
            <div className="pageEmptyActions">
              <Button onClick={() => nav("/dashboard")}>К результатам</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <section className="dashboardSection">
            <div className="dashboardSectionHead">
              <div className="dashboardSectionIntro">
                <div className="dashboardSectionEyebrow">Контроль</div>
                <h2 className="dashboardSectionTitle">Состояние контрольных порогов</h2>
                <p className="dashboardSectionText">{sourceText}</p>
                {preliminaryLimits ? (
                  <p className="dashboardSectionText">
                    {limitSourceDescription(effectiveLimitSource)}
                  </p>
                ) : null}
              </div>
              <div className="dashboardSectionMeta">
                <span className="dashboardSectionTag">{decision.title}</span>
                <span className="dashboardSectionTag">{stressSummary.count} стрессов</span>
              </div>
            </div>
            <div className="dashboardSectionBody">
              <div className="dashboardKpiGrid limitsKpiGrid">
                <div className={`dashboardKpiCard dashboardKpiCard--${decision.tone === "danger" ? "danger" : decision.tone === "warning" ? "warning" : "success"}`}>
                  <span className="dashboardKpiLabel">Макс. загрузка</span>
                  <strong className="dashboardKpiValue">{pct(overallUtilization, 1)}</strong>
                  <span className="dashboardKpiMeta">{decision.text}</span>
                </div>
                <div className="dashboardKpiCard">
                  <span className="dashboardKpiLabel">Ближайшая граница</span>
                  <strong className="dashboardKpiValue">{closestLimit?.label ?? "—"}</strong>
                  <span className="dashboardKpiMeta">
                    {closestLimit
                      ? closestLimit.headroom >= 0
                        ? `Запас ${formatNumber(closestLimit.headroom, 0)}`
                        : `Дефицит ${formatNumber(Math.abs(closestLimit.headroom), 0)}`
                      : "Нет лимитов"}
                  </span>
                </div>
                <div className="dashboardKpiCard">
                  <span className="dashboardKpiLabel">Свободный буфер</span>
                  <strong className="dashboardKpiValue">{formatNumber(totalHeadroom, 0)}</strong>
                  <span className="dashboardKpiMeta">{totalDeficit > 0 ? `Дефицит ${formatNumber(totalDeficit, 0)}` : "Дефицита нет"}</span>
                </div>
                <div className="dashboardKpiCard">
                  <span className="dashboardKpiLabel">Худший стресс-убыток</span>
                  <strong className="dashboardKpiValue">{formatNumber(stressSummary.worstLoss, 0)}</strong>
                  <span className="dashboardKpiMeta">{stressSummary.worstScenario}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="dashboardSection">
            <div className="dashboardSectionHead">
              <div className="dashboardSectionIntro">
                <div className="dashboardSectionEyebrow">Разбор</div>
                <h2 className="dashboardSectionTitle">Приоритеты контроля</h2>
              </div>
              <div className="dashboardSectionMeta">
                <span className="dashboardSectionTag">превышения {breachedCount + stressSummary.breached}</span>
              </div>
            </div>
            <div className="dashboardSectionBody">
              <div className="dashboardCoreGrid limitsCoreGrid">
                <Card>
                  <div className="cardTitle">Загрузка по метрикам</div>
                  <div className="cardSubtitle">Сверху видно, какая метрика первой станет проблемой.</div>
                  <div className="limitsLoadList pageSection--tight">
                    {limitRows.map((row) => (
                      <div key={row.metric} className="limitsLoadRow">
                        <div className="limitsLoadHead">
                          <span>{row.label}</span>
                          <strong>{pct(row.utilization, 1)}</strong>
                        </div>
                        <div className="limitsLoadTrack">
                          <span
                            className={`limitsLoadFill limitsLoadFill--${row.zone}`}
                            style={{ width: `${Math.min(Math.max(row.utilization, 0), 100)}%` }}
                          />
                        </div>
                        <div className="limitsLoadMeta">
                          <span>Факт {formatNumber(row.value, 0)}</span>
                          <span>Порог {formatNumber(row.limit, 0)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <div className="cardTitle">Настройка порогов</div>
                  <div className="cardSubtitle">Авто-режим рассчитывает черновые контрольные пороги. Ручной режим применяет введённые пользователем значения.</div>
                  <div className="limitsModeSwitch pageSection--tight" role="group" aria-label="Режим контрольных порогов">
                    <button
                      type="button"
                      className={`limitsModeButton ${limitMode === "auto" ? "limitsModeButton--active" : ""}`}
                      onClick={applyAutoMode}
                    >
                      Черновые авто
                    </button>
                    <button
                      type="button"
                      className={`limitsModeButton ${limitMode === "manual" ? "limitsModeButton--active" : ""}`}
                      onClick={() => setLimitMode("manual")}
                    >
                      Ручные
                    </button>
                  </div>
                  <div className="limitsManualGrid pageSection--tight">
                    {(["var_hist", "es_hist", "lc_var"] as const).map((key) => (
                      <label key={key} className="limitsManualField">
                        <span>{metricLabel(key)}</span>
                        <input
                          value={manualValues[key]}
                          inputMode="decimal"
                          disabled={limitMode !== "manual"}
                          onChange={(event) => setManualValues((prev) => ({ ...prev, [key]: event.target.value }))}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="limitsPolicyNote">
                    Авто-пороги считаются по эвристическим коэффициентам и soft floor. Они подходят для предварительного контроля, но не для решения о compliance.
                  </div>
                  <label className="limitsPolicyNote">
                    <input
                      type="checkbox"
                      checked={manualApproved}
                      disabled={limitMode !== "manual"}
                      onChange={(event) => setManualApproved(event.target.checked)}
                    />{" "}
                    Я подтверждаю, что ручные пороги соответствуют утверждённой risk-policy.
                  </label>
                  <div className="inlineActions pageSection--tight">
                    <Button disabled={limitMode !== "manual" || !canApplyManual} onClick={applyManualLimits}>
                      Применить ручные пороги
                    </Button>
                    <Button variant="secondary" onClick={() => nav("/stress")}>Стрессы</Button>
                    <Button variant="secondary" onClick={() => nav("/export")}>Экспорт</Button>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="cardTitle">Контрольная таблица</div>
                <div className="cardSubtitle">Факт, текущий порог, запас и статус по каждой метрике.</div>
                <AppTable
                  ariaLabel="Таблица лимитов"
                  headers={["Метрика", "Факт", "Порог", "Запас", "Загрузка", "Статус"]}
                  rows={limitRows.map((row) => ({
                    key: row.metric,
                    cells: [
                      row.label,
                      formatNumber(row.value, 2),
                      formatNumber(row.limit, 2),
                      <span key={`${row.metric}-headroom`} className={row.headroom < 0 ? "limitsNegativeText" : "limitsPositiveText"}>
                        {row.headroom < 0 ? "-" : ""}
                        {formatNumber(Math.abs(row.headroom), 2)}
                      </span>,
                      pct(row.utilization, 1),
                      <Chip key={`${row.metric}-status`} color={row.zone as "success" | "warning" | "danger"} variant="flat" radius="sm">
                        {row.breached ? "Выше порога" : row.utilization > 85 ? "Близко" : "Ниже порога"}
                      </Chip>,
                    ],
                  }))}
                  emptyContent="Пороги не были применены к расчёту."
                />
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
