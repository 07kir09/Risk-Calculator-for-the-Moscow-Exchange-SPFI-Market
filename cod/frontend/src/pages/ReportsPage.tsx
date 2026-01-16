import { useDemoMetrics, useDemoScenarios } from "../hooks/useDemoData";
import { exportCSV, exportExcel, exportJSON } from "../lib/exporters";
import Button from "../components/Button";
import { useState } from "react";

export default function ReportsPage() {
  const { data: metrics } = useDemoMetrics();
  const [status, setStatus] = useState("");
  const tables = {
    metrics: metrics ? [metrics] : [],
    stress: metrics?.stress || [],
    limits: metrics?.limits || [],
  };
  return (
    <div className="card">
      <h2>Отчёты и экспорт</h2>
      <p>Выберите формат отчёта. В отчёт включены параметры расчёта и лог валидации (если есть).</p>
      <div className="flex wrap">
        <Button onClick={() => { exportCSV(tables, "report"); setStatus("CSV сохранён (демо)."); }}>Скачать CSV</Button>
        <Button variant="secondary" onClick={() => { exportExcel(tables, "report.xlsx"); setStatus("Excel сохранён (демо)."); }}>Скачать Excel</Button>
        <Button onClick={() => { exportJSON(tables, "report.json"); setStatus("JSON сохранён (демо)."); }}>Скачать JSON</Button>
      </div>
      {status && <div className="badge ok" style={{ marginTop: 8 }}>{status}</div>}
    </div>
  );
}
