import { useNavigate } from "react-router-dom";
import { Chip, Table } from "@heroui/react";
import Button from "../components/Button";
import { useAppData } from "../state/appDataStore";
import { formatNumber } from "../utils/format";

export default function PortfolioPage() {
  const nav = useNavigate();
  const { state } = useAppData();
  const positions = state.portfolio.positions;
  const notionals = positions.reduce((sum, position) => sum + (Number(position.notional) || 0), 0);
  const instruments = new Set(positions.map((position) => position.instrument_type)).size;
  const filename = state.portfolio.filename;
  const sourceLabel = positions.length === 0 && !filename ? "Новая сессия" : state.portfolio.source.toUpperCase();

  return (
    <div className="importPagePlain">
      <div className="importHeroRow">
        <div>
          <h1 className="pageTitle">Портфель</h1>
          <div className="importHeroMeta">
            <Chip color={positions.length > 0 ? "success" : "default"} variant="flat" radius="sm" size="sm">
              {positions.length > 0 ? "Портфель загружен" : "Портфель пуст"}
            </Chip>
            {filename && <span className="importFileTag">{filename}</span>}
            <span className="importFileTag">{sourceLabel}</span>
          </div>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="importZone">
          <div className="pageEmptyState">
            <div className="badge warn">Портфель пуст</div>
            <div className="textMuted">
              Загрузите CSV, Excel или демо-данные на шаге «Импорт сделок».
            </div>
            <div className="pageEmptyActions">
              <Button onClick={() => nav("/import")}>Перейти к импорту</Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="importZone importZone--loaded">
            <div className="importPortfolioKpis">
              <div className="importPortfolioKpi">
                <span>Позиции</span>
                <strong>{positions.length}</strong>
              </div>
              <div className="importPortfolioKpi">
                <span>Типов инструментов</span>
                <strong>{instruments}</strong>
              </div>
              <div className="importPortfolioKpi">
                <span>Суммарный номинал</span>
                <strong title={String(notionals)}>{formatNumber(notionals)}</strong>
              </div>
              <div className="importPortfolioKpi">
                <span>Валют</span>
                <strong>{new Set(positions.map((position) => position.currency).filter(Boolean)).size}</strong>
              </div>
            </div>
          </div>

          <div className="importBody">
            <div className="importBodyMain">
              <Table variant="secondary">
                <Table.ScrollContainer>
                  <Table.Content aria-label="Портфель" className="importPositionsTable">
                    <Table.Header>
                      <Table.Column isRowHeader>ID</Table.Column>
                      <Table.Column>Тип</Table.Column>
                      <Table.Column>Кол-во</Table.Column>
                      <Table.Column>Номинал</Table.Column>
                      <Table.Column>Базовый</Table.Column>
                      <Table.Column>Валюта</Table.Column>
                      <Table.Column>Цена</Table.Column>
                      <Table.Column>Страйк/фикс</Table.Column>
                      <Table.Column>Vol</Table.Column>
                      <Table.Column>Ставка</Table.Column>
                      <Table.Column>Дата погашения</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {positions.map((p, index) => (
                        <Table.Row key={`${p.position_id}-${index}`}>
                          <Table.Cell>{p.position_id}</Table.Cell>
                          <Table.Cell>{p.instrument_type}</Table.Cell>
                          <Table.Cell title={String(p.quantity)}>{formatNumber(Number(p.quantity), 6)}</Table.Cell>
                          <Table.Cell title={String(p.notional)}>{formatNumber(Number(p.notional), 6)}</Table.Cell>
                          <Table.Cell>{p.underlying_symbol}</Table.Cell>
                          <Table.Cell>{p.currency}</Table.Cell>
                          <Table.Cell title={String(p.underlying_price)}>{formatNumber(Number(p.underlying_price), 6)}</Table.Cell>
                          <Table.Cell title={String(p.strike)}>{formatNumber(Number(p.strike), 6)}</Table.Cell>
                          <Table.Cell title={String(p.volatility)}>{formatNumber(Number(p.volatility), 6)}</Table.Cell>
                          <Table.Cell title={String(p.risk_free_rate)}>{formatNumber(Number(p.risk_free_rate), 6)}</Table.Cell>
                          <Table.Cell>{p.maturity_date}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
