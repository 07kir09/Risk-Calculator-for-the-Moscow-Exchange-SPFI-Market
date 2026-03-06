import { useRiskStore } from "../../app/store/useRiskStore";

function download(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(","));
  return [headers.join(","), ...lines].join("\n");
}

export function CalculationActions() {
  const positions = useRiskStore((state) => state.positionsDraft);
  const scenarios = useRiskStore((state) => state.scenariosDraft);
  const result = useRiskStore((state) => state.calculationResult);

  const stressRows = result?.stress ?? [];
  const contributorRows = result?.top_contributors
    ? [...result.top_contributors.var_hist, ...result.top_contributors.es_hist, ...result.top_contributors.stress]
    : [];

  return (
    <div className="flex-row gap-8 wrap">
      <button
        className="btn"
        onClick={() =>
          download(
            `draft-${Date.now()}.json`,
            JSON.stringify({ positions, scenarios }, null, 2),
            "application/json"
          )
        }
      >
        Экспорт черновика JSON
      </button>

      <button
        className="btn"
        onClick={() => download(`positions-${Date.now()}.csv`, toCsv(positions as unknown as Record<string, unknown>[]), "text/csv")}
      >
        Экспорт позиций CSV
      </button>

      <button
        className="btn"
        onClick={() => download(`scenarios-${Date.now()}.csv`, toCsv(scenarios as unknown as Record<string, unknown>[]), "text/csv")}
      >
        Экспорт сценариев CSV
      </button>

      <button
        className="btn"
        disabled={!result}
        onClick={() => download(`result-${Date.now()}.json`, JSON.stringify(result, null, 2), "application/json")}
      >
        Экспорт результата JSON
      </button>

      <button
        className="btn"
        disabled={!stressRows.length}
        onClick={() => download(`stress-${Date.now()}.csv`, toCsv(stressRows as unknown as Record<string, unknown>[]), "text/csv")}
      >
        Экспорт стресса CSV
      </button>

      <button
        className="btn"
        disabled={!contributorRows.length}
        onClick={() =>
          download(
            `contributors-${Date.now()}.csv`,
            toCsv(contributorRows as unknown as Record<string, unknown>[]),
            "text/csv"
          )
        }
      >
        Экспорт контрибьюторов CSV
      </button>
    </div>
  );
}
