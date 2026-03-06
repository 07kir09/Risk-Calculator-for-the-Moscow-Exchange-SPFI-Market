import { useRiskStore } from "../../app/store/useRiskStore";
import { RunConfigPanel } from "./RunConfigPanel";

export function RunConfigDrawer() {
  const show = useRiskStore((state) => state.showSettingsDrawer);
  const setShow = useRiskStore((state) => state.setShowSettingsDrawer);

  if (!show) {
    return null;
  }

  return (
    <aside className="drawer drawer-medium drawer-settings">
      <div className="drawer-header">
        <h3 className="section-title">Настройки / Конфиг расчёта</h3>
        <button className="btn" onClick={() => setShow(false)}>Закрыть</button>
      </div>
      <div className="drawer-content">
        <RunConfigPanel />
      </div>
    </aside>
  );
}
