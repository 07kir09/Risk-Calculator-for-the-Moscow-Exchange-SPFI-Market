import { KeyboardEvent, MouseEvent as ReactMouseEvent, useMemo, useRef, useState } from "react";
import { useRiskStore, ScenariosFilterPreset } from "../../app/store/useRiskStore";
import { useDefaultScenariosQuery } from "../../shared/api/hooks";
import { scenarioPresets } from "../../shared/constants/defaults";
import { ScenarioDraft } from "../../shared/types/contracts";
import { formatPercentFromDecimal } from "../../shared/formatters/numberFormat";
import { ScenarioFormModal } from "./ScenarioFormModal";

const ROW_HEIGHT = 38;
const OVERSCAN = 8;
const VIRTUALIZATION_THRESHOLD = 120;
const MIN_COLUMN_WIDTH = 90;

const defaultScenario: ScenarioDraft = {
  scenario_id: `scenario_${Date.now()}`,
  underlying_shift: 0,
  volatility_shift: 0,
  rate_shift: 0,
  probability: null,
};

const scenarioFilterPresets: Array<{ key: ScenariosFilterPreset; label: string }> = [
  { key: "all", label: "Все" },
  { key: "with_probability", label: "С вероятностями" },
  { key: "stress_only", label: "Только стресс" },
  { key: "base_like", label: "Похожие на базовый" },
];

const scenarioColumns = ["scenario_id", "underlying_shift", "volatility_shift", "rate_shift", "probability", "actions"] as const;
const scenarioColumnLabel: Record<(typeof scenarioColumns)[number], string> = {
  scenario_id: "ID сценария",
  underlying_shift: "Сдвиг базового",
  volatility_shift: "Сдвиг волатильности",
  rate_shift: "Сдвиг ставки",
  probability: "Вероятность",
  actions: "Действия",
};

const defaultColumnWidths: Record<string, number> = {
  scenario_id: 180,
  underlying_shift: 140,
  volatility_shift: 140,
  rate_shift: 120,
  probability: 120,
  actions: 220,
};

export function ScenariosTable() {
  const scenarios = useRiskStore((state) => state.scenariosDraft);
  const addScenario = useRiskStore((state) => state.addScenario);
  const duplicateScenario = useRiskStore((state) => state.duplicateScenario);
  const updateScenario = useRiskStore((state) => state.updateScenario);
  const deleteScenarios = useRiskStore((state) => state.deleteScenarios);
  const normalizeScenarioProbabilities = useRiskStore((state) => state.normalizeScenarioProbabilities);
  const loadDefaultScenarios = useRiskStore((state) => state.loadDefaultScenarios);
  const globalSearchQuery = useRiskStore((state) => state.globalSearchQuery);
  const scenariosFilterPreset = useRiskStore((state) => state.scenariosFilterPreset);
  const setScenariosFilterPreset = useRiskStore((state) => state.setScenariosFilterPreset);

  const { data: defaultScenariosResponse } = useDefaultScenariosQuery();
  const [editing, setEditing] = useState<ScenarioDraft | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(defaultColumnWidths);

  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  const weightedMode = useMemo(
    () => scenarios.some((scenario) => scenario.probability !== null && scenario.probability !== undefined),
    [scenarios]
  );

  const probabilitySum = useMemo(
    () => scenarios.reduce((sum, scenario) => sum + Number(scenario.probability ?? 0), 0),
    [scenarios]
  );

  const filtered = useMemo(() => {
    const query = globalSearchQuery.trim().toLowerCase();

    function isStressOnly(scenario: ScenarioDraft): boolean {
      return Math.max(
        Math.abs(scenario.underlying_shift ?? 0),
        Math.abs(scenario.volatility_shift ?? 0),
        Math.abs(scenario.rate_shift ?? 0)
      ) >= 0.08;
    }

    function isBaseLike(scenario: ScenarioDraft): boolean {
      return (
        Math.abs(scenario.underlying_shift ?? 0) <= 0.005 &&
        Math.abs(scenario.volatility_shift ?? 0) <= 0.005 &&
        Math.abs(scenario.rate_shift ?? 0) <= 0.001
      );
    }

    function matchesPreset(scenario: ScenarioDraft): boolean {
      if (scenariosFilterPreset === "all") return true;
      if (scenariosFilterPreset === "with_probability") {
        return scenario.probability !== null && scenario.probability !== undefined;
      }
      if (scenariosFilterPreset === "stress_only") return isStressOnly(scenario);
      if (scenariosFilterPreset === "base_like") return isBaseLike(scenario);
      return true;
    }

    return scenarios.filter((scenario) => {
      const matchesQuery = !query || scenario.scenario_id.toLowerCase().includes(query);
      return matchesQuery && matchesPreset(scenario);
    });
  }, [globalSearchQuery, scenarios, scenariosFilterPreset]);

  const isVirtualized = filtered.length > VIRTUALIZATION_THRESHOLD;
  const startIndex = isVirtualized ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const endIndex = isVirtualized
    ? Math.min(filtered.length, startIndex + Math.ceil(380 / ROW_HEIGHT) + OVERSCAN * 2)
    : filtered.length;
  const visibleRows = filtered.slice(startIndex, endIndex);
  const topSpacer = isVirtualized ? startIndex * ROW_HEIGHT : 0;
  const bottomSpacer = isVirtualized ? (filtered.length - endIndex) * ROW_HEIGHT : 0;

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
    if (!filtered.length) return;
    const clamped = Math.max(0, Math.min(filtered.length - 1, index));

    if (tableWrapRef.current && isVirtualized) {
      tableWrapRef.current.scrollTop = Math.max(0, clamped * ROW_HEIGHT - ROW_HEIGHT * 2);
    }

    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-scenario-view-index='${String(clamped)}']`);
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
      focusRow(filtered.length - 1);
    }
  }

  return (
    <div className="panel panel-padded-12 stack-10">
      <div className="filters-compact">
        <span className="filters-compact-title">Сценарии:</span>
        <button className="btn btn-compact" onClick={() => setEditing({ ...defaultScenario, scenario_id: `scenario_${Date.now()}` })}>
          + Добавить
        </button>
        <button className="btn btn-compact" onClick={() => loadDefaultScenarios(defaultScenariosResponse?.data ?? scenarioPresets)}>
          Загрузить дефолтные
        </button>
        {scenarioPresets.map((preset) => (
          <button
            key={preset.scenario_id}
            className="filter-chip"
            onClick={() => addScenario({ ...preset, scenario_id: `${preset.scenario_id}_${Date.now()}` })}
          >
            {preset.scenario_id}
          </button>
        ))}
      </div>

      <div className="filters-compact">
        <span className="filters-compact-title">Фильтр:</span>
        {scenarioFilterPresets.map((preset) => (
          <button
            key={preset.key}
            className={`filter-chip${scenariosFilterPreset === preset.key ? " filter-chip-active" : ""}`}
            onClick={() => setScenariosFilterPreset(preset.key)}
          >
            {preset.label}
          </button>
        ))}
        {weightedMode ? <span className="badge badge-warning">Вероятностный режим</span> : <span className="badge">Невзвешенный режим</span>}
        <span className="filter-stat">Сумма вероятностей: {probabilitySum.toFixed(4)}</span>
        {weightedMode && Math.abs(probabilitySum - 1) > 1e-6 ? (
          <button className="filter-chip filter-chip-accent" onClick={normalizeScenarioProbabilities}>
            Нормализовать до 1.0
          </button>
        ) : null}
      </div>

      <div
        ref={tableWrapRef}
        className="table-wrap table-wrap-380"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <table className="table-resizable">
          <colgroup>
            {scenarioColumns.map((column) => (
              <col key={`col-${column}`} width={getColumnWidth(column)} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {scenarioColumns.map((column) => (
                <th key={column}>
                  <span className="th-label">{scenarioColumnLabel[column]}</span>
                  <span className="col-resizer" onMouseDown={(event) => beginResize(column, event)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr>
                <td colSpan={6}>Сценарии отсутствуют. Загрузите дефолтные или добавьте вручную.</td>
              </tr>
            ) : null}

            {filtered.length > 0 && topSpacer > 0 ? (
              <tr aria-hidden>
                <td colSpan={6} className="row-spacer-cell" height={topSpacer} />
              </tr>
            ) : null}

            {visibleRows.map((scenario, localIndex) => {
              const viewIndex = startIndex + localIndex;
              return (
                <tr
                  key={scenario.scenario_id}
                  tabIndex={0}
                  data-scenario-view-index={viewIndex}
                  aria-rowindex={viewIndex + 1}
                  onKeyDown={(event) => onRowKeyDown(event, viewIndex)}
                >
                  <td>{scenario.scenario_id}</td>
                  <td>
                    {formatPercentFromDecimal(scenario.underlying_shift ?? 0, 2)}
                  </td>
                  <td>
                    {formatPercentFromDecimal(scenario.volatility_shift ?? 0, 2)}
                  </td>
                  <td>
                    {formatPercentFromDecimal(scenario.rate_shift ?? 0, 2)}
                  </td>
                  <td>
                    {scenario.probability ?? "-"}
                  </td>
                  <td>
                    <div className="flex-row gap-6">
                      <button className="btn" onClick={() => setEditing(scenario)}>
                        Изменить
                      </button>
                      <button className="btn" onClick={() => duplicateScenario(scenario.scenario_id)}>
                        Дублировать
                      </button>
                      <button className="btn" onClick={() => deleteScenarios([scenario.scenario_id])}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length > 0 && bottomSpacer > 0 ? (
              <tr aria-hidden>
                <td colSpan={6} className="row-spacer-cell" height={bottomSpacer} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ScenarioFormModal
        open={Boolean(editing)}
        initial={editing ?? defaultScenario}
        onClose={() => setEditing(null)}
        onSave={(value) => {
          const exists = scenarios.some((scenario) => scenario.scenario_id === value.scenario_id);
          if (exists) {
            updateScenario(value.scenario_id, value);
          } else {
            addScenario(value);
          }
        }}
      />
    </div>
  );
}
