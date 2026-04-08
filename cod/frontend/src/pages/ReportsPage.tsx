import { useDemoMetrics } from "../hooks/useDemoData";
import { exportCSV, exportExcel, exportJSON } from "../lib/exporters";
import Button from "../components/Button";
import { useState } from "react";
import Card from "../ui/Card";

export default function ReportsPage() {
  const { data: metrics } = useDemoMetrics();
  const [status, setStatus] = useState("");
  const tables = {
    metrics: metrics ? [metrics] : [],
    stress: metrics?.stress || [],
    limits: metrics?.limits || [],
  };
  return (
    <Card>
      <h1 className="pageTitle">Отчёты и экспорт</h1>
      <p className="pageHint">Выберите формат отчёта. В отчёт включаются параметры расчёта и лог валидации, если они есть.</p>
      <div className="inlineActions pageSection--tight">
        <Button onClick={() => { exportCSV(tables, "report"); setStatus("CSV сохранён (демо)."); }}>Скачать CSV</Button>
        <Button variant="secondary" onClick={() => { exportExcel(tables, "report.xlsx"); setStatus("Excel сохранён (демо)."); }}>Скачать Excel</Button>
        <Button onClick={() => { exportJSON(tables, "report.json"); setStatus("JSON сохранён (демо)."); }}>Скачать JSON</Button>
      </div>
      {status && <div className="badge ok statusMessage--compact">{status}</div>}
    </Card>
  );
}
