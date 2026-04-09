import AppCheckbox from "./AppCheckbox";

interface Props {
  alpha: number;
  setAlpha: (v: number) => void;
  useParametric: boolean;
  setUseParametric: (v: boolean) => void;
}

export default function MetricsSelector({ alpha, setAlpha, useParametric, setUseParametric }: Props) {
  return (
    <div>
      <label htmlFor="metrics-alpha">
        Уровень доверия (VaR/ES)
        <input id="metrics-alpha" type="number" step={0.001} min={0.8} max={0.999} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
      </label>
      <div style={{ marginTop: 12 }}>
        <AppCheckbox
          id="metrics-use-parametric"
          isSelected={useParametric}
          onChange={setUseParametric}
          label="Использовать параметрический VaR/ES"
          description="Если выключено, используется исторический сценарный подход."
          size="sm"
        />
      </div>
      <p className="code">Подписи формул: VaR = zσ√t; ES = E[Loss | Loss ≥ VaR]; LC VaR = VaR + ∑|qty|*liquidity_haircut.</p>
    </div>
  );
}
