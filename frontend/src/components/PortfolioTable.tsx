import { OptionPosition } from "../types";

interface Props {
  positions: OptionPosition[];
}

export default function PortfolioTable({ positions }: Props) {
  if (!positions.length) return <p>Портфель пуст. Загрузите CSV/JSON с позициями (см. образцы в public/).</p>;
  return (
    <div>
      <h2>Портфель</h2>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th><th>Тип</th><th>Стиль</th><th>Кол-во</th><th>Базовый</th><th>Валюта</th><th>Цена</th><th>Страйк</th><th>Vol</th><th>Див.</th><th>r</th><th>Expiry</th><th>Valuation</th><th>Ликв. надб.</th><th>Модель</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr key={p.position_id}>
              <td>{p.position_id}</td>
              <td>{p.option_type}</td>
              <td>{p.style}</td>
              <td>{p.quantity}</td>
              <td>{p.underlying_symbol}</td>
              <td>{p.currency}</td>
              <td>{p.underlying_price}</td>
              <td>{p.strike}</td>
              <td>{p.volatility}</td>
              <td>{p.dividend_yield ?? 0}</td>
              <td>{p.risk_free_rate}</td>
              <td>{p.maturity_date}</td>
              <td>{p.valuation_date}</td>
              <td>{p.liquidity_haircut ?? 0}</td>
              <td>{p.model || "auto"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
