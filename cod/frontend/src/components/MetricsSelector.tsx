interface Props {
  alpha: number;
  setAlpha: (v: number) => void;
  useParametric: boolean;
  setUseParametric: (v: boolean) => void;
}

export default function MetricsSelector({ alpha, setAlpha, useParametric, setUseParametric }: Props) {
  return (
    <div>
      <label>
        Уровень доверия (VaR/ES)
        <input type="number" step={0.001} min={0.8} max={0.999} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
      </label>
      <label style={{ display: "block", marginTop: 12 }}>
        <input type="checkbox" checked={useParametric} onChange={(e) => setUseParametric(e.target.checked)} />
        Использовать параметрический VaR/ES (иначе исторический)
      </label>
      <p className="code">Подписи формул: VaR = zσ√t; ES = E[Loss | Loss ≥ VaR]; LC VaR = VaR + ∑|qty|*liquidity_haircut.</p>
    </div>
  );
}
