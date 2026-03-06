import { useRiskStore } from "../../app/store/useRiskStore";

export function SummaryStrip() {
  const positions = useRiskStore((state) => state.positionsDraft.length);
  const scenarios = useRiskStore((state) => state.scenariosDraft.length);
  const runConfig = useRiskStore((state) => state.runConfigDraft);

  return (
    <div className="panel panel-padded-10 flex-row gap-10 wrap">
      <span className="badge" title={`Позиции: ${positions}`}>Позиции: {positions}</span>
      <span className="badge" title={`Сценарии: ${scenarios}`}>Сценарии: {scenarios}</span>
      <span className="badge" title={`Базовая валюта: ${runConfig.base_currency ?? "RUB"}`}>Базовая валюта: {runConfig.base_currency ?? "RUB"}</span>
      <span className="badge" title={`Горизонт: ${runConfig.horizon_days ?? 1}`}>Горизонт: {runConfig.horizon_days ?? 1}</span>
      <span className="badge" title={`Уровень доверия: ${runConfig.alpha ?? 0.99}`}>Уровень доверия: {runConfig.alpha ?? 0.99}</span>
    </div>
  );
}
