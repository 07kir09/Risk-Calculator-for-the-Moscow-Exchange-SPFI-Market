import { useMemo } from "react";
import { useRiskStore } from "../../app/store/useRiskStore";

export function FxRatesEditor() {
  const positions = useRiskStore((state) => state.positionsDraft);
  const runConfig = useRiskStore((state) => state.runConfigDraft);
  const setRunConfigDraft = useRiskStore((state) => state.setRunConfigDraft);

  const baseCurrency = (runConfig.base_currency ?? "RUB").toUpperCase();

  const foreignCurrencies = useMemo(() => {
    const unique = new Set<string>();
    positions.forEach((position) => {
      const code = (position.currency ?? "RUB").toUpperCase();
      if (code !== baseCurrency) {
        unique.add(code);
      }
    });
    return Array.from(unique);
  }, [positions, baseCurrency]);

  if (!foreignCurrencies.length) {
    return <div className="small-muted">FX-редактор появляется только для мультивалютного портфеля.</div>;
  }

  const fxRates = runConfig.fx_rates ?? {};

  function setRate(currency: string, value: number) {
    setRunConfigDraft({
      fx_rates: {
        ...fxRates,
        [currency]: value,
      },
    });
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Валюта</th>
            <th>Курс к {baseCurrency}</th>
          </tr>
        </thead>
        <tbody>
          {foreignCurrencies.map((currency) => (
            <tr key={currency}>
              <td>{currency}</td>
              <td>
                <input
                  className="control"
                  type="number"
                  step="0.0001"
                  value={fxRates[currency] ?? ""}
                  onChange={(event) => setRate(currency, Number(event.target.value))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
