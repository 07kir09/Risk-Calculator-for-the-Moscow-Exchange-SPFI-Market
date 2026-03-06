import { KeyboardEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRiskStore, PositionsFilterPreset } from "../../app/store/useRiskStore";
import { PositionDraft } from "../../shared/types/contracts";
import { positionColumns } from "../../shared/constants/defaults";
import { validatePosition } from "../../shared/lib/validation";
import { PositionFormModal } from "./PositionFormModal";

const ROW_HEIGHT = 38;
const OVERSCAN = 8;
const VIRTUALIZATION_THRESHOLD = 120;
const MIN_COLUMN_WIDTH = 90;

const defaultNewPosition: PositionDraft = {
  instrument_type: "option",
  position_id: `pos_${Date.now()}`,
  option_type: "call",
  style: "european",
  quantity: 1,
  notional: 1,
  underlying_symbol: "MOEX",
  underlying_price: 100,
  strike: 100,
  volatility: 0.2,
  maturity_date: "2026-12-31",
  valuation_date: "2026-01-01",
  risk_free_rate: 0.05,
  dividend_yield: 0,
  currency: "RUB",
  liquidity_haircut: 0,
  model: "black_scholes",
};

const positionFilterPresets: Array<{ key: PositionsFilterPreset; label: string }> = [
  { key: "all", label: "Все" },
  { key: "options", label: "Опционы" },
  { key: "forwards", label: "Форварды" },
  { key: "swaps", label: "Свопы" },
  { key: "long", label: "Лонг" },
  { key: "short", label: "Шорт" },
  { key: "multi_currency", label: "Мультивалюта" },
];

const positionColumnLabel: Partial<Record<keyof PositionDraft | "actions", string>> = {
  position_id: "ID позиции",
  instrument_type: "Тип инструмента",
  underlying_symbol: "Базовый актив",
  option_type: "Тип опциона",
  style: "Стиль",
  quantity: "Количество",
  notional: "Номинал",
  underlying_price: "Цена базового",
  strike: "Страйк",
  volatility: "Волатильность",
  maturity_date: "Дата погашения",
  valuation_date: "Дата оценки",
  risk_free_rate: "Безриск. ставка",
  dividend_yield: "Див. доходность",
  currency: "Валюта",
  liquidity_haircut: "Haircut ликвидности",
  model: "Модель",
  fixed_rate: "Фикс. ставка",
  float_rate: "Плавающая ставка",
  day_count: "База дней",
  actions: "Действия",
};

const defaultColumnWidths: Record<string, number> = {
  select: 54,
  actions: 220,
  position_id: 150,
  instrument_type: 130,
  underlying_symbol: 150,
  option_type: 120,
  style: 120,
  quantity: 100,
  notional: 120,
  underlying_price: 140,
  strike: 100,
  volatility: 110,
  maturity_date: 130,
  valuation_date: 130,
  risk_free_rate: 130,
  dividend_yield: 130,
  currency: 90,
  liquidity_haircut: 140,
  model: 120,
  fixed_rate: 100,
  float_rate: 100,
  day_count: 100,
};

export function PositionsTable() {
  const positions = useRiskStore((state) => state.positionsDraft);
  const addPosition = useRiskStore((state) => state.addPosition);
  const updatePosition = useRiskStore((state) => state.updatePosition);
  const duplicatePosition = useRiskStore((state) => state.duplicatePosition);
  const deletePositions = useRiskStore((state) => state.deletePositions);
  const globalSearchQuery = useRiskStore((state) => state.globalSearchQuery);
  const positionsFilterPreset = useRiskStore((state) => state.positionsFilterPreset);
  const setPositionsFilterPreset = useRiskStore((state) => state.setPositionsFilterPreset);
  const requestValidationErrors = useRiskStore((state) => state.requestValidationErrors);
  const baseCurrency = useRiskStore((state) => (state.runConfigDraft.base_currency ?? "RUB").toUpperCase());

  const [sortKey, setSortKey] = useState<keyof PositionDraft>("position_id");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [hiddenColumns, setHiddenColumns] = useState<Array<keyof PositionDraft>>([]);
  const [editing, setEditing] = useState<PositionDraft | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColumnWidths);

  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  const visibleColumns = useMemo(
    () => positionColumns.filter((column) => column === "actions" || !hiddenColumns.includes(column as keyof PositionDraft)),
    [hiddenColumns]
  );
  const originalIndexById = useMemo(
    () => new Map(positions.map((position, index) => [position.position_id, index])),
    [positions]
  );

  const filtered = useMemo(() => {
    const query = globalSearchQuery.trim().toLowerCase();
    const currencies = new Set(positions.map((position) => (position.currency ?? "RUB").toUpperCase()));
    const isMultiCurrencyPortfolio = currencies.size > 1;

    function matchesQuery(position: PositionDraft): boolean {
      if (!query) return true;
      const positionId = position.position_id.toLowerCase();
      const symbol = position.underlying_symbol.toLowerCase();
      return positionId.includes(query) || symbol.includes(query);
    }

    function matchesPreset(position: PositionDraft): boolean {
      const type = position.instrument_type ?? "option";
      if (positionsFilterPreset === "all") return true;
      if (positionsFilterPreset === "options") return type === "option";
      if (positionsFilterPreset === "forwards") return type === "forward";
      if (positionsFilterPreset === "swaps") return type === "swap_ir";
      if (positionsFilterPreset === "long") return position.quantity > 0;
      if (positionsFilterPreset === "short") return position.quantity < 0;
      if (positionsFilterPreset === "multi_currency") {
        return isMultiCurrencyPortfolio && (position.currency ?? "RUB").toUpperCase() !== baseCurrency;
      }
      return true;
    }

    return positions.filter((position) => matchesQuery(position) && matchesPreset(position));
  }, [baseCurrency, globalSearchQuery, positions, positionsFilterPreset]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((left, right) => {
      const leftValue = String(left[sortKey] ?? "");
      const rightValue = String(right[sortKey] ?? "");
      return sortAsc ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
    });
    return rows;
  }, [filtered, sortAsc, sortKey]);

  const rowIssueCountById = useMemo(() => {
    const issuesById = new Map<string, number>();

    positions.forEach((position, index) => {
      const issueCount = validatePosition(position, index).length;
      if (issueCount > 0) {
        issuesById.set(position.position_id, issueCount);
      }
    });

    requestValidationErrors.forEach((issue) => {
      if (typeof issue.rowIndex === "number") {
        const positionId = positions[issue.rowIndex]?.position_id;
        if (positionId) {
          issuesById.set(positionId, (issuesById.get(positionId) ?? 0) + 1);
        }
      }
    });

    return issuesById;
  }, [positions, requestValidationErrors]);

  const isVirtualized = sorted.length > VIRTUALIZATION_THRESHOLD;
  const startIndex = isVirtualized ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const endIndex = isVirtualized
    ? Math.min(sorted.length, startIndex + Math.ceil(420 / ROW_HEIGHT) + OVERSCAN * 2)
    : sorted.length;
  const visibleRows = sorted.slice(startIndex, endIndex);
  const topSpacer = isVirtualized ? startIndex * ROW_HEIGHT : 0;
  const bottomSpacer = isVirtualized ? (sorted.length - endIndex) * ROW_HEIGHT : 0;

  useEffect(() => {
    const firstRequestIssue = requestValidationErrors.find((issue) => typeof issue.rowIndex === "number");
    if (!firstRequestIssue || firstRequestIssue.rowIndex === undefined) {
      return;
    }
    const element = document.querySelector<HTMLElement>(
      `[data-position-row-index='${String(firstRequestIssue.rowIndex)}']`
    );
    if (!element) return;
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [requestValidationErrors]);

  function getColumnWidth(column: string): number {
    return columnWidths[column] ?? defaultColumnWidths[column] ?? 120;
  }

  function beginResize(column: string, event: ReactMouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = getColumnWidth(column);

    function onMouseMove(mouseEvent: MouseEvent) {
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + (mouseEvent.clientX - startX));
      setColumnWidths((prev) => ({ ...prev, [column]: nextWidth }));
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function focusRow(index: number) {
    if (!sorted.length) return;
    const clamped = Math.max(0, Math.min(sorted.length - 1, index));

    if (tableWrapRef.current && isVirtualized) {
      tableWrapRef.current.scrollTop = Math.max(0, clamped * ROW_HEIGHT - ROW_HEIGHT * 2);
    }

    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-position-view-index='${String(clamped)}']`);
      row?.focus();
    });
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, viewIndex: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(viewIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(viewIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(sorted.length - 1);
    }
  }

  function toggleColumn(column: keyof PositionDraft) {
    setHiddenColumns((prev) => (prev.includes(column) ? prev.filter((item) => item !== column) : [...prev, column]));
  }

  function toggleSelect(positionId: string) {
    setSelectedRows((prev) => (prev.includes(positionId) ? prev.filter((item) => item !== positionId) : [...prev, positionId]));
  }

  function openEdit(position: PositionDraft) {
    setEditing({ ...position });
  }

  return (
    <div className="panel panel-padded-12 stack-10">
      <div className="filters-compact">
        <span className="filters-compact-title">Фильтр:</span>
        <button className="btn btn-compact" onClick={() => addPosition({ ...defaultNewPosition, position_id: `pos_${Date.now()}` })}>
          + Добавить
        </button>
        <button className="btn btn-compact" disabled={!selectedRows.length} onClick={() => deletePositions(selectedRows)}>
          Удалить выбранные
        </button>
        {positionFilterPresets.map((preset) => (
          <button
            key={preset.key}
            className={`filter-chip${positionsFilterPreset === preset.key ? " filter-chip-active" : ""}`}
            onClick={() => setPositionsFilterPreset(preset.key)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="filters-compact">
        <span className="filters-compact-title">Колонки:</span>
        {positionColumns
          .filter((column) => column !== "actions")
          .map((column) => (
            <button
              key={column}
              className={`filter-chip${hiddenColumns.includes(column as keyof PositionDraft) ? " filter-chip-muted" : ""}`}
              onClick={() => toggleColumn(column as keyof PositionDraft)}
            >
              {positionColumnLabel[column as keyof PositionDraft] ?? column}
            </button>
          ))}
      </div>

      <div
        ref={tableWrapRef}
        className="table-wrap table-wrap-420"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <table className="table-resizable">
          <colgroup>
            <col width={getColumnWidth("select")} />
            {visibleColumns.map((column) => (
              <col key={`col-${column}`} width={getColumnWidth(String(column))} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>
                <span className="th-label">№</span>
                <span className="col-resizer" onMouseDown={(event) => beginResize("select", event)} />
              </th>
              {visibleColumns.map((column) => (
                <th
                  key={column}
                  onClick={() => {
                    if (column === "actions") return;
                    const key = column as keyof PositionDraft;
                    if (sortKey === key) {
                      setSortAsc((prev) => !prev);
                    } else {
                      setSortKey(key);
                      setSortAsc(true);
                    }
                  }}
                >
                  <span className="th-label">{positionColumnLabel[column as keyof PositionDraft | "actions"] ?? column}</span>
                  <span className="col-resizer" onMouseDown={(event) => beginResize(String(column), event)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!sorted.length ? (
              <tr>
                <td colSpan={visibleColumns.length + 1}>Позиции отсутствуют. Добавьте вручную или загрузите CSV.</td>
              </tr>
            ) : null}

            {sorted.length > 0 && topSpacer > 0 ? (
              <tr aria-hidden>
                <td colSpan={visibleColumns.length + 1} className="row-spacer-cell" height={topSpacer} />
              </tr>
            ) : null}

            {visibleRows.map((position, localIndex) => {
              const viewIndex = startIndex + localIndex;
              const originalIndex = originalIndexById.get(position.position_id) ?? -1;
              const issueCount = rowIssueCountById.get(position.position_id) ?? 0;
              return (
                <tr
                  key={position.position_id}
                  data-position-row-index={originalIndex}
                  data-position-view-index={viewIndex}
                  tabIndex={0}
                  onKeyDown={(event) => onRowKeyDown(event, viewIndex)}
                  aria-rowindex={viewIndex + 1}
                >
                  <td>
                    <div className="flex-row gap-6 align-center">
                      <input
                        aria-label={`select-${position.position_id}`}
                        type="checkbox"
                        checked={selectedRows.includes(position.position_id)}
                        onChange={() => toggleSelect(position.position_id)}
                      />
                      {issueCount > 0 ? (
                        <span
                          className="row-error-dot"
                          aria-label={`row-${position.position_id}-has-errors`}
                          title={`Ошибок валидации: ${issueCount}`}
                        />
                      ) : null}
                    </div>
                  </td>

                  {visibleColumns.map((column) => {
                    if (column === "actions") {
                      return (
                        <td key={`${position.position_id}-actions`}>
                          <div className="flex-row gap-6">
                            <button className="btn" onClick={() => openEdit(position)}>
                              Изменить
                            </button>
                            <button className="btn" onClick={() => duplicatePosition(position.position_id)}>
                              Дублировать
                            </button>
                            <button className="btn" onClick={() => deletePositions([position.position_id])}>
                              Удалить
                            </button>
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td key={`${position.position_id}-${column}`}>
                        {String(position[column as keyof PositionDraft] ?? "-")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {sorted.length > 0 && bottomSpacer > 0 ? (
              <tr aria-hidden>
                <td colSpan={visibleColumns.length + 1} className="row-spacer-cell" height={bottomSpacer} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PositionFormModal
        open={Boolean(editing)}
        initial={editing ?? defaultNewPosition}
        onClose={() => setEditing(null)}
        onSave={(next) => updatePosition(next.position_id, next)}
      />
    </div>
  );
}
