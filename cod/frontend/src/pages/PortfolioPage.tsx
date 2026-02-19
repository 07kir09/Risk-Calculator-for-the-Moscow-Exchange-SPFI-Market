import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/Button";
import { PositionDTO } from "../api/types";
import Card from "../ui/Card";
import DataTable from "../ui/DataTable";
import PageHeader from "../ui/PageHeader";
import StatePanel from "../ui/StatePanel";
import SegmentedControl from "../ui/SegmentedControl";
import { useAppData } from "../state/appDataStore";

type SortKey = "position_id" | "instrument_type" | "quantity" | "currency" | "maturity_date";

export default function PortfolioPage() {
  const nav = useNavigate();
  const { state } = useAppData();
  const positions = state.portfolio.positions;
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [sortKey, setSortKey] = useState<SortKey>("position_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedPositions = useMemo(() => {
    const next = [...positions];
    next.sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv), "ru")
        : String(bv).localeCompare(String(av), "ru");
    });
    return next;
  }, [positions, sortDir, sortKey]);

  const applySort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  return (
    <Card>
      <PageHeader
        kicker="Portfolio"
        title="Портфель"
        subtitle="Просмотр и контроль загруженных позиций. Если данные некорректны, вернитесь на шаг импорта."
        actions={<Button variant="secondary" onClick={() => nav("/import")}>Открыть импорт</Button>}
      />

      {positions.length === 0 ? (
        <StatePanel
          tone="warning"
          title="Портфель пуст"
          description="Загрузите CSV или демо‑данные на шаге «Импорт сделок»."
          action={<Button onClick={() => nav("/import")}>Перейти к импорту</Button>}
        />
      ) : (
        <>
          <div className="row wrap" style={{ justifyContent: "space-between", marginTop: 12 }}>
            <div className="textMuted">{positions.length} позиций</div>
            <SegmentedControl
              ariaLabel="Плотность таблицы портфеля"
              value={density}
              onChange={setDensity}
              options={[
                { value: "comfortable", label: "Удобно" },
                { value: "compact", label: "Компактно" },
              ]}
            />
          </div>

          <DataTable<PositionDTO>
            compact={density === "compact"}
            rows={sortedPositions}
            rowKey={(row) => row.position_id}
            columns={[
              { key: "id", header: <button className="tableSortBtn" onClick={() => applySort("position_id")}>ID</button>, render: (row) => row.position_id },
              { key: "type", header: <button className="tableSortBtn" onClick={() => applySort("instrument_type")}>Тип</button>, render: (row) => row.instrument_type },
              { key: "quantity", header: <button className="tableSortBtn" onClick={() => applySort("quantity")}>Кол-во</button>, render: (row) => row.quantity },
              { key: "notional", header: "Номинал", render: (row) => row.notional },
              { key: "underlying", header: "Базовый", render: (row) => row.underlying_symbol },
              { key: "currency", header: <button className="tableSortBtn" onClick={() => applySort("currency")}>Валюта</button>, render: (row) => row.currency },
              { key: "spot", header: "Цена", render: (row) => row.underlying_price },
              { key: "strike", header: "Страйк/фикс", render: (row) => row.strike },
              { key: "vol", header: "Vol", render: (row) => row.volatility },
              { key: "rate", header: "Ставка", render: (row) => row.risk_free_rate },
              { key: "maturity", header: <button className="tableSortBtn" onClick={() => applySort("maturity_date")}>Дата погашения</button>, render: (row) => row.maturity_date },
            ]}
          />
        </>
      )}
    </Card>
  );
}
