import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import Card from "../ui/Card";
import { useAppData } from "../state/appDataStore";
import { formatNumber } from "../utils/format";

export default function PortfolioPage() {
  const nav = useNavigate();
  const { state } = useAppData();
  const positions = state.portfolio.positions;
  const notionals = positions.reduce((sum, position) => sum + (Number(position.notional) || 0), 0);
  const instruments = new Set(positions.map((position) => position.instrument_type)).size;

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
          <div className="pageEmptyState">
            <div className="badge warn">Портфель пуст</div>
            <div className="textMuted">
              Загрузите CSV, Excel или демо-данные на шаге «Импорт сделок».
            </div>
            <div className="pageEmptyActions">
              <Button onClick={() => nav("/import")}>Перейти к импорту</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="compactGrid pageSection--tight">
            <Card>
              <div className="cardTitle">Позиции</div>
              <div className="kpiValue kpiValue--mono">{positions.length}</div>
            </Card>
            <Card>
              <div className="cardTitle">Типов инструментов</div>
              <div className="kpiValue kpiValue--mono">{instruments}</div>
            </Card>
            <Card>
              <div className="cardTitle">Суммарный номинал</div>
              <div className="kpiValue kpiValue--sm" title={String(notionals)}>
                {formatNumber(notionals)}
              </div>
            </Card>
          </div>

          <div className="table-wrap pageSection--tight">
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
                    <td title={String(p.quantity)}>{formatNumber(Number(p.quantity), 6)}</td>
                    <td title={String(p.notional)}>{formatNumber(Number(p.notional), 6)}</td>
                    <td>{p.underlying_symbol}</td>
                    <td>{p.currency}</td>
                    <td title={String(p.underlying_price)}>{formatNumber(Number(p.underlying_price), 6)}</td>
                    <td title={String(p.strike)}>{formatNumber(Number(p.strike), 6)}</td>
                    <td title={String(p.volatility)}>{formatNumber(Number(p.volatility), 6)}</td>
                    <td title={String(p.risk_free_rate)}>{formatNumber(Number(p.risk_free_rate), 6)}</td>
                    <td>{p.maturity_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
