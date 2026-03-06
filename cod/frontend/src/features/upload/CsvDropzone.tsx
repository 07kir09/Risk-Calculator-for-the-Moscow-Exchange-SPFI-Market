import Papa from "papaparse";
import { useRef } from "react";
import { sanitizeCsvHeader } from "../../shared/lib/csvImport";

type CsvDropzoneProps = {
  onLoaded: (payload: {
    fileName: string;
    rows: Record<string, string>[];
    delimiter: string;
  }) => void;
};

export function CsvDropzone({ onLoaded }: CsvDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function parse(file: File) {
    Papa.parse<Record<string, string | undefined>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => sanitizeCsvHeader(header),
      complete: (result) => {
        const sanitizedRows: Record<string, string>[] = result.data.map((row) => {
          const entries = Object.entries(row).map(([key, value]) => [sanitizeCsvHeader(key), String(value ?? "").trim()]);
          return Object.fromEntries(entries);
        });
        onLoaded({
          fileName: file.name,
          rows: sanitizedRows,
          delimiter: result.meta.delimiter || ",",
        });
      },
    });
  }

  return (
    <div
      className="panel csv-dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) parse(file);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <div className="stack-6">
        <div className="upload-cloud">☁</div>
        <h3 className="section-title">Перетащите CSV-файл сюда</h3>
        <p className="small-muted flow-0">или нажмите для выбора файла</p>
        <p className="small-muted flow-0">Поддерживаемый формат: .csv</p>
        <p className="small-muted flow-0">Кодировка: предпочтительно UTF-8. Разделитель определяется автоматически (, ; табуляция).</p>
      </div>

      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) parse(file);
        }}
      />
    </div>
  );
}
