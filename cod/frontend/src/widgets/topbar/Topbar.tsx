import { Search, Save, Settings, UserRound } from "lucide-react";
import { RunStatusChip } from "../status/RunStatusChip";
import { ValidationBadge } from "../status/ValidationBadge";
import { useRiskStore } from "../../app/store/useRiskStore";
import { useRef } from "react";

type TopbarProps = {
  pageTitle: string;
};

export function Topbar({ pageTitle }: TopbarProps) {
  const setShowSettingsDrawer = useRiskStore((state) => state.setShowSettingsDrawer);
  const setShowDebugDrawer = useRiskStore((state) => state.setShowDebugDrawer);
  const globalSearchQuery = useRiskStore((state) => state.globalSearchQuery);
  const setGlobalSearchQuery = useRiskStore((state) => state.setGlobalSearchQuery);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="topbar">
      <div className="stack-2">
        <div className="topbar-title">{pageTitle}</div>
        <div className="small-muted">Аналитика и расчёт рисков</div>
      </div>

      <div className="topbar-actions">
        <RunStatusChip />
        <ValidationBadge />
        <div className="topbar-search-wrap">
          <input
            ref={searchInputRef}
            className="control topbar-search-input"
            aria-label="глобальный поиск"
            placeholder="Поиск по позициям и сценариям"
            value={globalSearchQuery}
            onChange={(event) => setGlobalSearchQuery(event.target.value)}
          />
          <Search size={14} className="topbar-search-icon" />
        </div>
        <button className="btn" aria-label="поиск" title="Поиск" onClick={() => searchInputRef.current?.focus()}>
          <Search size={14} />
        </button>
        <button className="btn" aria-label="экспорт-отладка" title="Экспорт и отладка" onClick={() => setShowDebugDrawer(true)}>
          <Save size={14} />
        </button>
        <button className="btn" aria-label="настройки" title="Настройки" onClick={() => setShowSettingsDrawer(true)}>
          <Settings size={14} />
        </button>
        <button className="btn" aria-label="профиль" title="Профиль">
          <UserRound size={14} />
        </button>
      </div>
    </header>
  );
}
