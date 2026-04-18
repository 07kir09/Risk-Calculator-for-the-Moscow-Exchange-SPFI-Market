import { useEffect, useMemo, useState } from "react";
import {
  Chip,
  Input,
  TextArea,
} from "@heroui/react";
import { useNavigate } from "react-router-dom";
import AppTabs from "../components/AppTabs";
import AppTable from "../components/AppTable";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import Card from "../ui/Card";
import {
  AreaTrendChart,
  CompareBarsChart,
  DonutGauge,
  GlassPanel,
  Reveal,
  Sparkline,
  StaggerGroup,
  StaggerItem,
} from "../components/rich/RichVisuals";
import { ChartInsights } from "../components/rich/ChartInsights";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";
import { WorkflowStep } from "../workflow/workflowTypes";
import { formatNumber } from "../utils/format";
import { runRiskCalculation } from "../api/services/risk";
import { ContributorBars } from "../components/monolith/visuals";
import { buildContributorInsights, buildStressInsights } from "../lib/chartInsights";

export default function StressPage() {
  const nav = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch } = useWorkflow();
  const metrics = dataState.results.metrics;
  const stress = metrics?.stress || [];
  const topStressContributors = metrics?.top_contributors?.stress ?? [];
  const [status, setStatus] = useState("");
  const [isRecalc, setIsRecalc] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (metrics) dispatch({ type: "COMPLETE_STEP", step: WorkflowStep.Stress });
  }, [dispatch, metrics]);

  const worst = useMemo(() => (stress.length ? Math.min(...stress.map((item) => item.pnl)) : undefined), [stress]);

  const [draftId, setDraftId] = useState("custom");
  const [draftS, setDraftS] = useState(0);
  const [draftVol, setDraftVol] = useState(0);
  const [draftR, setDraftR] = useState(0);
  const [draftProb, setDraftProb] = useState<number | "">("");
  const [draftDesc, setDraftDesc] = useState("Пользовательский сценарий");

  const alpha = Number(wf.calcConfig.params?.alpha ?? 0.99);
  const horizonDays = Number(wf.calcConfig.params?.horizonDays ?? 10);
  const parametricTailModel = String(wf.calcConfig.params?.parametricTailModel ?? "cornish_fisher");
  const baseCurrency = String(wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase();
  const fxRates = (wf.calcConfig.params?.fxRates as Record<string, number> | undefined) ?? undefined;
  const liquidityModel = String(wf.calcConfig.params?.liquidityModel ?? "fraction_of_position_value");
  const selectedMetrics = wf.calcConfig.selectedMetrics;

  const recalcNow = async () => {
    setStatus("");
    setIsRecalc(true);
    const calcRunId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    dispatch({ type: "SET_CALC_RUN", calcRunId, status: "running", startedAt });
    try {
      const updated = await runRiskCalculation({
        positions: dataState.portfolio.positions,
        scenarios: dataState.scenarios,
        limits: dataState.limits ?? undefined,
        alpha,
        horizonDays,
        parametricTailModel,
        baseCurrency,
        fxRates,
        liquidityModel,
        selectedMetrics,
        marginEnabled: wf.calcConfig.marginEnabled,
        marketDataSessionId: dataState.marketDataSummary?.session_id,
      });
      dataDispatch({ type: "SET_RESULTS", metrics: updated });
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "success", startedAt, finishedAt: new Date().toISOString() });
      setStatus("Результаты стрессов обновлены.");
    } catch (error: any) {
      dispatch({ type: "SET_CALC_RUN", calcRunId, status: "error", startedAt, finishedAt: new Date().toISOString() });
      setStatus(error?.message ?? "Ошибка пересчёта");
    } finally {
      setIsRecalc(false);
    }
  };

  const handleCreate = () => {
    if (!draftId.trim()) return;
    const probability = draftProb === "" ? undefined : Number(draftProb);
    dataDispatch({
      type: "SET_SCENARIOS",
      scenarios: [
        ...dataState.scenarios.filter((scenario) => scenario.scenario_id !== draftId.trim()),
        {
          scenario_id: draftId.trim(),
          underlying_shift: draftS,
          volatility_shift: draftVol,
          rate_shift: draftR,
          probability,
          description: draftDesc,
        },
      ],
    });
    setStatus("Сценарий обновлён. Нажмите «Пересчитать», чтобы увидеть новый P&L.");
  };

  const removeScenario = (id: string) => {
    dataDispatch({ type: "SET_SCENARIOS", scenarios: dataState.scenarios.filter((scenario) => scenario.scenario_id !== id) });
    setStatus("Сценарий удалён. Чтобы обновить результаты, пересчитайте стресс-блок.");
  };

  const contributorBars = useMemo(() => {
    const max = Math.max(...topStressContributors.map((row) => Math.abs(row.pnl_contribution)), 1);
    return topStressContributors.slice(0, 6).map((row, index) => ({
      label: `${row.position_id}${row.scenario_id ? ` · ${row.scenario_id}` : ` · ${index + 1}`}`,
      value: (Math.abs(row.pnl_contribution) / max) * 100,
      tone: row.pnl_contribution < 0 ? "negative" as const : "positive" as const,
    }));
  }, [topStressContributors]);
  const stressTrendData = useMemo(
    () =>
      (stress.length
        ? stress
        : [{ scenario_id: "base", pnl: 0, limit: 0, breached: false }]
      ).map((scenario) => ({
        label: scenario.scenario_id,
        value: scenario.pnl,
        secondary: scenario.limit ?? 0,
      })),
    [stress]
  );
  const breachShare = stress.length ? (stress.filter((item) => item.breached).length / stress.length) * 100 : 0;
  const scenarioSpark = useMemo(
    () => dataState.scenarios.slice(0, 8).map((scenario, index) => ({ label: `${index + 1}`, value: Math.abs(scenario.underlying_shift) + Math.abs(scenario.volatility_shift) + Math.abs(scenario.rate_shift) })),
    [dataState.scenarios]
  );
  const stressProfileInsights = useMemo(
    () => buildStressInsights({ stressRows: stress, scenarioCount: dataState.scenarios.length, baseCurrency }),
    [baseCurrency, dataState.scenarios.length, stress]
  );
  const stressDriverInsights = useMemo(
    () => buildContributorInsights({ contributors: topStressContributors }),
    [topStressContributors]
  );

  return (
    <Card>
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Удалить сценарий?"
        description={
          <div className="stack">
            <div>Сценарий <span className="code">{confirmDelete ?? ""}</span> будет удалён из текущей сессии.</div>
            <div className="textMuted">Чтобы обновить stress P&L, нужно пересчитать результаты.</div>
          </div>
        }
        confirmText="Удалить"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeScenario(confirmDelete);
          setConfirmDelete(null);
        }}
      />

      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Стресс-сценарии</h1>
          <p className="pageHint">Экран отвечает на два вопроса: какие сценарии заложены и какой убыток они дают.</p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/dashboard")}>Назад</Button>
          <Button variant="secondary" loading={isRecalc} disabled={!metrics || isRecalc} onClick={recalcNow}>
            Пересчитать
          </Button>
        </div>
      </div>

      {!metrics ? (
        <Card>
          <div className="textMuted">Нет результатов. Сначала выполните расчёт.</div>
          <div className="runActionRow">
            <Button onClick={() => nav("/dashboard")}>К результатам</Button>
          </div>
        </Card>
      ) : (
        <div className="configureLayout">
          <div className="configureMain">
            <StaggerGroup className="visualSplitPanel">
              <StaggerItem>
                <GlassPanel
                  title="Стрессовый профиль"
                  subtitle="График показывает форму сценарного хвоста, а donut — долю breach-сценариев."
                  badge={<Chip color={worst !== undefined && worst < 0 ? "danger" : "success"} variant="flat" radius="sm">{worst !== undefined ? formatNumber(worst, 2) : "—"}</Chip>}
                >
                  <div className="visualSplitPanel">
                    <AreaTrendChart data={stressTrendData} color="#ff7777" accent="#7da7ff" showSecondary />
                    <DonutGauge value={breachShare} label="breach share" subtitle="Процент стресс-сценариев, которые уже пересекают лимит." color="#ff7777" />
                  </div>
                  <ChartInsights items={stressProfileInsights} />
                </GlassPanel>
              </StaggerItem>
              <StaggerItem>
                <GlassPanel title="Драйверы stress" subtitle="Кто именно вносит наибольший вклад в худший stress P&L.">
                  <CompareBarsChart data={contributorBars} height={240} />
                  <Sparkline data={scenarioSpark} color="#7da7ff" height={88} />
                  <ChartInsights items={stressDriverInsights} />
                </GlassPanel>
              </StaggerItem>
            </StaggerGroup>

            <Reveal delay={0.06}>
              <Card>
                <AppTabs
                  ariaLabel="Работа со стрессами"
                  tabs={[
                    {
                      id: "results",
                      label: "Результаты",
                      content: (
                        <>
                          <div className="runSummaryHeader">
                            <div>
                              <div className="cardTitle">Результаты стрессов</div>
                              <div className="cardSubtitle">Худший сценарий должен быть понятен без дополнительных кликов.</div>
                            </div>
                            <Chip color={worst !== undefined && worst < 0 ? "danger" : "success"} variant="flat" radius="sm">
                              Худший stress P&L: {worst !== undefined ? formatNumber(worst, 2) : "—"}
                            </Chip>
                          </div>

                          <AppTable
                            ariaLabel="Stress P&L"
                            headers={["Сценарий", "P&L", "Лимит", "Статус"]}
                            rows={stress.map((scenario) => ({
                              key: scenario.scenario_id,
                              cells: [
                                scenario.scenario_id,
                                formatNumber(scenario.pnl, 2),
                                scenario.limit ?? "—",
                                <Chip key={`${scenario.scenario_id}-status`} color={scenario.breached ? "danger" : "success"} variant="flat" radius="sm">
                                  {scenario.breached ? "Превышен" : "Ок"}
                                </Chip>,
                              ],
                            }))}
                            emptyContent="Стресс-сценарии не были рассчитаны."
                          />
                        </>
                      ),
                    },
                    {
                      id: "contributors",
                      label: "Вкладчики",
                      content: (
                        <>
                          <div className="cardTitle">Вкладчики в худший стресс</div>
                          <div className="cardSubtitle">Помогает понять, какие позиции формируют основную просадку.</div>
                          <ContributorBars rows={contributorBars} />
                        </>
                      ),
                    },
                  ]}
                />

                {status && (
                  <Chip color="success" variant="flat" radius="sm" className="importIssueChip statusMessage">
                    {status}
                  </Chip>
                )}
              </Card>
            </Reveal>
          </div>

          <aside className="importAside">
            <Card>
              <div className="cardTitle">Редактор сценария</div>
              <div className="formGrid">
                <Input label="ID сценария" value={draftId} onChange={(event) => setDraftId(event.target.value)} />
                <Input type="number" label="ΔS" value={String(draftS)} onChange={(event) => setDraftS(Number(event.target.value))} />
                <Input type="number" label="ΔVol" value={String(draftVol)} onChange={(event) => setDraftVol(Number(event.target.value))} />
                <Input type="number" label="Δr" value={String(draftR)} onChange={(event) => setDraftR(Number(event.target.value))} />
                <Input
                  type="number"
                  label="Probability"
                  value={draftProb === "" ? "" : String(draftProb)}
                  onChange={(event) => setDraftProb(event.target.value === "" ? "" : Number(event.target.value))}
                />
              </div>
              <TextArea
                label="Описание"
                rows={3}
                value={draftDesc}
                onChange={(event) => setDraftDesc(event.target.value)}
                className="configureTextarea"
              />
              <div className="runActionRow">
                <Button variant="secondary" onClick={handleCreate}>Сохранить сценарий</Button>
              </div>
            </Card>

            <Card>
              <div className="cardTitle">Текущие сценарии</div>
              <div className="scenarioPreviewList">
                {dataState.scenarios.map((scenario) => (
                  <div key={scenario.scenario_id} className="scenarioPreviewItem">
                    <div>
                      <strong>{scenario.scenario_id}</strong>
                      <div className="textMuted">{scenario.description ?? "Без описания"}</div>
                    </div>
                    <div className="runActionRow scenarioActionWrap">
                      <Button variant="ghost" onClick={() => setConfirmDelete(scenario.scenario_id)}>Удалить</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      )}
    </Card>
  );
}
