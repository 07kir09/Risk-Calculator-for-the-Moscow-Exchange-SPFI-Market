import { useState } from "react";
import { MarketScenario } from "../types";

interface Props {
  scenarios: MarketScenario[];
  setScenarios: (s: MarketScenario[]) => void;
}

export default function ScenariosEditor({ scenarios, setScenarios }: Props) {
  const [draft, setDraft] = useState<MarketScenario>({
    scenario_id: "custom",
    underlying_shift: 0,
    volatility_shift: 0,
    rate_shift: 0,
    probability: undefined,
    description: "Пользовательский сценарий",
  });

  const addScenario = () => {
    if (!draft.scenario_id) return;
    setScenarios([...scenarios, draft]);
    setDraft({
      scenario_id: "custom",
      underlying_shift: 0,
      volatility_shift: 0,
      rate_shift: 0,
      probability: undefined,
      description: "Пользовательский сценарий",
    });
  };

  const removeScenario = (id: string) => {
    setScenarios(scenarios.filter((s) => s.scenario_id !== id));
  };

  return (
    <div>
      <h3>Стресс-сценарии</h3>
      <p className="code">Опишите, что шокируется: цена базового актива (underlying_shift), волатильность (volatility_shift), ставка (rate_shift). Например: -0.1 = падение цены на 10%.</p>
      <div className="grid" style={{ marginBottom: 12 }}>
        <label>id<input value={draft.scenario_id} onChange={(e) => setDraft({ ...draft, scenario_id: e.target.value })} /></label>
        <label>underlying_shift<input type="number" step="0.01" value={draft.underlying_shift} onChange={(e) => setDraft({ ...draft, underlying_shift: Number(e.target.value) })} /></label>
        <label>volatility_shift<input type="number" step="0.01" value={draft.volatility_shift} onChange={(e) => setDraft({ ...draft, volatility_shift: Number(e.target.value) })} /></label>
        <label>rate_shift<input type="number" step="0.001" value={draft.rate_shift} onChange={(e) => setDraft({ ...draft, rate_shift: Number(e.target.value) })} /></label>
        <label>probability<input type="number" step="0.0001" min={0} value={draft.probability ?? ""} onChange={(e) => setDraft({ ...draft, probability: e.target.value === "" ? undefined : Number(e.target.value) })} /></label>
        <label>Описание<input value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      </div>
      <button className="button" onClick={addScenario}>Добавить сценарий</button>
      <table className="table" style={{ marginTop: 12 }}>
        <thead><tr><th>ID</th><th>ΔS</th><th>ΔVol</th><th>Δr</th><th>Prob</th><th>Описание</th><th></th></tr></thead>
        <tbody>
          {scenarios.map((s) => (
            <tr key={s.scenario_id}>
              <td>{s.scenario_id}</td>
              <td>{s.underlying_shift}</td>
              <td>{s.volatility_shift}</td>
              <td>{s.rate_shift}</td>
              <td>{s.probability ?? "—"}</td>
              <td>{s.description || "—"}</td>
              <td><button className="button secondary" onClick={() => removeScenario(s.scenario_id)}>Удалить</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
