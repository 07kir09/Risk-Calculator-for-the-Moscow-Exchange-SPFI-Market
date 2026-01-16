import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";

export default function PortfolioPage() {
  const nav = useNavigate();
  const { state } = useAppData();
  const positions = state.portfolio.positions;
  return (
    <Card>
      <div className="pageHeader">
        <div className="pageHeaderText">
          <h1 className="pageTitle">Портфель</h1>
          <p className="pageHint">
            Здесь видно, что именно загружено в систему. Если что‑то не так — вернитесь на шаг «Импорт сделок» и загрузите файл заново.
          </p>
        </div>
        <div className="pageActions">
          <Button variant="secondary" onClick={() => nav("/import")}>
            Открыть импорт
          </Button>
        </div>
      </div>

      {positions.length === 0 ? (
        <Card>
          <div className="badge warn">Портфель пуст</div>
          <div className="textMuted" style={{ marginTop: 10 }}>
            Загрузите CSV или демо‑данные на шаге «Импорт сделок».
          </div>
          <div className="row wrap" style={{ marginTop: 12 }}>
            <Button onClick={() => nav("/import")}>Перейти к импорту</Button>
          </div>
        </Card>
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table sticky">
            <thead>
              <tr>
                <th>ID</th>
                <th>Тип</th>
                <th>Кол-во</th>
                <th>Номинал</th>
                <th>Базовый</th>
                <th>Валюта</th>
                <th>Цена</th>
                <th>Страйк/фикс</th>
                <th>Vol</th>
                <th>Ставка</th>
                <th>Дата погашения</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.position_id}>
                  <td>{p.position_id}</td>
                  <td>{p.instrument_type}</td>
                  <td>{p.quantity}</td>
                  <td>{p.notional}</td>
                  <td>{p.underlying_symbol}</td>
                  <td>{p.currency}</td>
                  <td>{p.underlying_price}</td>
                  <td>{p.strike}</td>
                  <td>{p.volatility}</td>
                  <td>{p.risk_free_rate}</td>
                  <td>{p.maturity_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
