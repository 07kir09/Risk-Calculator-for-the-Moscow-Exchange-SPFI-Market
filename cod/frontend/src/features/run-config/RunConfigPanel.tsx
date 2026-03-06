import { ChangeEvent } from "react";
import { useRiskStore } from "../../app/store/useRiskStore";
import { FxRatesEditor } from "./FxRatesEditor";

const calculationFlags = [
  { key: "calc_sensitivities", label: "Чувствительности" },
  { key: "calc_var_es", label: "VaR / ES" },
  { key: "calc_stress", label: "Стресс" },
  { key: "calc_margin_capital", label: "Маржа / капитал" },
  { key: "calc_correlations", label: "Корреляции" },
] as const;

export function RunConfigPanel() {
  const runConfig = useRiskStore((state) => state.runConfigDraft);
  const setRunConfigDraft = useRiskStore((state) => state.setRunConfigDraft);

  function updateBoolean(key: string) {
    setRunConfigDraft({ [key]: !(runConfig as any)[key] });
  }

  function updateText(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>, key: string) {
    const value = event.target.value;
    setRunConfigDraft({ [key]: value } as any);
  }

  function updateNumber(event: ChangeEvent<HTMLInputElement>, key: string) {
    setRunConfigDraft({ [key]: Number(event.target.value) } as any);
  }

  return (
    <div className="panel panel-padded-12 stack-12">
      <div className="stack-8">
        <h4 className="section-title">Базовые параметры</h4>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Уровень доверия (alpha)</span>
            <input className="control" type="number" step="0.0001" value={runConfig.alpha ?? 0.99} onChange={(event) => updateNumber(event, "alpha")} />
          </label>
          <label className="field">
            <span className="field-label">Горизонт (дни)</span>
            <input className="control" type="number" value={runConfig.horizon_days ?? 1} onChange={(event) => updateNumber(event, "horizon_days")} />
          </label>
          <label className="field">
            <span className="field-label">Базовая валюта</span>
            <input className="control" value={runConfig.base_currency ?? "RUB"} onChange={(event) => updateText(event, "base_currency")} />
          </label>
          <label className="field">
            <span className="field-label">Режим</span>
            <select className="select" value={runConfig.mode ?? "api"} onChange={(event) => updateText(event, "mode")}>
              <option value="api">API (боевой)</option>
              <option value="demo">Демо</option>
            </select>
          </label>
        </div>
      </div>

      <div className="stack-8">
        <h4 className="section-title">Модель хвоста</h4>
        <label className="field">
          <span className="field-label">Параметрическая хвостовая модель</span>
          <select className="select" value={runConfig.parametric_tail_model ?? "normal"} onChange={(event) => updateText(event, "parametric_tail_model")}>
            <option value="normal">Нормальная</option>
            <option value="cornish_fisher">Корниш-Фишер</option>
          </select>
        </label>
      </div>

      <div className="stack-8">
        <h4 className="section-title">Ликвидность</h4>
        <label className="field">
          <span className="field-label">Модель ликвидности</span>
          <select className="select" value={runConfig.liquidity_model ?? "fraction_of_position_value"} onChange={(event) => updateText(event, "liquidity_model")}>
            <option value="fraction_of_position_value">Доля от стоимости позиции</option>
            <option value="half_spread_fraction">Доля половины спрэда</option>
            <option value="absolute_per_contract">Фиксированно за контракт</option>
          </select>
        </label>
      </div>

      <div className="stack-8">
        <h4 className="section-title">Блоки расчёта</h4>
        <div className="filters-compact">
          <span className="filters-compact-title">Вычислять:</span>
          {calculationFlags.map((flag) => {
            const enabled = (runConfig as any)[flag.key] ?? true;
            return (
              <button
                key={flag.key}
                className={`filter-chip${enabled ? " filter-chip-active" : ""}`}
                onClick={() => updateBoolean(flag.key)}
                aria-pressed={enabled}
              >
                {flag.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="stack-8">
        <h4 className="section-title">Валюты (FX)</h4>
        <FxRatesEditor />
      </div>

      <div className="stack-6">
        <h4 className="section-title">Дополнительно / Отладка</h4>
        <div className="small-muted">Используйте кнопку экспорта в верхней панели для просмотра сырого запроса/ответа и технических метаданных.</div>
      </div>
    </div>
  );
}
