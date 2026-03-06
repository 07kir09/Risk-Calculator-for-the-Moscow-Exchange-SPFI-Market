import { useMemo, useState } from "react";
import { CsvDropzone } from "../features/upload/CsvDropzone";
import { UploadPreview } from "../features/upload/UploadPreview";
import { ColumnMappingPanel } from "../features/upload/ColumnMappingPanel";
import { PositionDraft } from "../shared/types/contracts";
import { requiredUploadTargets, uploadMappingTargets } from "../shared/constants/defaults";
import { useRiskStore } from "../app/store/useRiskStore";
import { validatePosition } from "../shared/lib/validation";
import { useNavigate } from "react-router-dom";
import { CsvColumnMapping, mapCsvRowToPosition, suggestColumnMapping } from "../shared/lib/csvImport";

type UploadState = {
  fileName: string;
  delimiter: string;
  rows: Record<string, string>[];
};

export function DataUploadPage() {
  const navigate = useNavigate();
  const importPositions = useRiskStore((state) => state.importPositions);

  const [upload, setUpload] = useState<UploadState | null>(null);
  const [mapping, setMapping] = useState<CsvColumnMapping>({});
  const [blockOnErrors, setBlockOnErrors] = useState(true);

  const columns = useMemo(() => (upload?.rows[0] ? Object.keys(upload.rows[0]) : []), [upload]);

  const matchedRequired = requiredUploadTargets.filter((target) => Boolean(mapping[target]));

  const mappedRows = useMemo(() => {
    if (!upload) return [];
    return upload.rows.map((row, index) => mapCsvRowToPosition(row, mapping, index));
  }, [mapping, upload]);

  const validation = useMemo(() => {
    if (!mappedRows.length) return { valid: 0, invalid: 0, issues: [] as string[] };
    const issues: string[] = [];
    let valid = 0;
    let invalid = 0;
    mappedRows.forEach((position, index) => {
      const rowIssues = validatePosition(position, index);
      if (rowIssues.length) {
        invalid += 1;
        rowIssues.forEach((issue) => issues.push(`строка ${index + 1}: ${issue.field} — ${issue.message}`));
      } else {
        valid += 1;
      }
    });
    return { valid, invalid, issues };
  }, [mappedRows]);

  function autoMatch(columnsList: string[]) {
    setMapping(suggestColumnMapping(columnsList, uploadMappingTargets));
  }

  function importNow() {
    const rowsToImport = blockOnErrors ? mappedRows.filter((position, index) => validatePosition(position, index).length === 0) : mappedRows;
    if (blockOnErrors && validation.invalid > 0) {
      return;
    }
    importPositions(rowsToImport);
    navigate(`/portfolio-builder?tab=positions&imported=${rowsToImport.length}`);
  }

  return (
    <div className="page-grid">
      <div className="grid-two-main">
        <CsvDropzone
          onLoaded={(payload) => {
            setUpload(payload);
            autoMatch(payload.rows[0] ? Object.keys(payload.rows[0]) : []);
          }}
        />

        <div className="panel panel-padded-12 stack-10 align-start">
          <h3 className="section-title">Параметры импорта</h3>
          <div className="filters-compact">
            <span className="filters-compact-title">Режим:</span>
            <button
              className={`filter-chip${blockOnErrors ? " filter-chip-active" : ""}`}
              onClick={() => setBlockOnErrors(true)}
            >
              Только валидные
            </button>
            <button
              className={`filter-chip${!blockOnErrors ? " filter-chip-active" : ""}`}
              onClick={() => setBlockOnErrors(false)}
            >
              Импортировать все
            </button>
          </div>
          <div className="filters-compact">
            <span className="filters-compact-title">Проверка:</span>
            <span className="filter-stat">Валидных: {validation.valid}</span>
            <span className="filter-stat">С ошибками: {validation.invalid}</span>
            <span className="filter-stat">Сопоставлено: {matchedRequired.length}/{requiredUploadTargets.length}</span>
          </div>
          <button className="btn btn-primary" disabled={!upload} onClick={importNow}>Импортировать в черновик</button>
        </div>
      </div>

      {upload ? <UploadPreview fileName={upload.fileName} delimiter={upload.delimiter} rows={upload.rows} /> : null}

      {upload ? (
        <ColumnMappingPanel
          columns={columns}
          mapping={mapping}
          sampleRow={upload.rows[0]}
          onChange={(target, column) => setMapping((prev) => ({ ...prev, [target as keyof PositionDraft]: column }))}
        />
      ) : null}

      {upload && validation.issues.length ? (
        <div className="panel panel-padded-12 stack-6">
          <h3 className="section-title">Предпросмотр валидации</h3>
          <div className="table-wrap-220 table-wrap-scroll-auto">
            {validation.issues.slice(0, 200).map((issue, index) => (
              <div key={`${issue}-${index}`} className="small-muted">{issue}</div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
