import { useState } from "react";
import Button from "./Button";

export default function Topbar() {
  const [selectedPortfolio, setSelectedPortfolio] = useState("Демо-портфель");
  return (
    <header className="topbar">
      <div className="topbar-section">
        <div className="muted">Риск-калькулятор</div>
        <div style={{ fontWeight: 700, letterSpacing: -0.01 }}>МОЕХ СПФИ</div>
      </div>
      <div className="topbar-section">
        <label className="label">Портфель</label>
        <select value={selectedPortfolio} onChange={(e) => setSelectedPortfolio(e.target.value)}>
          <option>Демо-портфель</option>
          <option>Портфель A</option>
          <option>Портфель B</option>
        </select>
      </div>
      <div className="topbar-section">
        <label className="label">Дата снапшота</label>
        <input type="date" defaultValue="2025-01-01" />
      </div>
      <div className="topbar-section">
        <Button>Запустить расчёт</Button>
      </div>
      <div className="topbar-status badge ok">API готов</div>
    </header>
  );
}
