import { ReactNode, useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { Button, ButtonGroup } from "@heroui/react";

export type AppTabItem = {
  id: string;
  label: ReactNode;
  content: ReactNode;
};

export default function AppTabs({
  ariaLabel,
  tabs,
  defaultTabId,
  tabStyle = "legacy",
}: {
  ariaLabel: string;
  tabs: AppTabItem[];
  defaultTabId?: string;
  tabStyle?: "legacy" | "ghostGroup";
}) {
  const firstTabId = tabs[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(defaultTabId ?? firstTabId);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === selectedId)) {
      setSelectedId(defaultTabId ?? firstTabId);
    }
  }, [defaultTabId, firstTabId, selectedId, tabs]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === selectedId) ?? tabs[0] ?? null,
    [selectedId, tabs]
  );

  if (!activeTab) return null;

  return (
    <div>
      {tabStyle === "ghostGroup" ? (
        <div className="appTabsGhostWrap" role="tablist" aria-label={ariaLabel}>
          <ButtonGroup variant="ghost" className="appTabsGhostGroup">
            {tabs.map((tab, index) => {
              const isActive = tab.id === activeTab.id;
              return (
                <Button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.id}`}
                  className={classNames("appTabGhostBtn", isActive && "appTabGhostBtn--active")}
                  onPress={() => setSelectedId(tab.id)}
                >
                  {index > 0 ? <ButtonGroup.Separator /> : null}
                  {tab.label}
                </Button>
              );
            })}
          </ButtonGroup>
        </div>
      ) : (
        <div className="importTabsList" role="tablist" aria-label={ariaLabel}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                className={classNames("importTab", isActive && "importTab--active")}
                onClick={() => setSelectedId(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
      <div
        id={`panel-${activeTab.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.id}`}
        className="importTabPanel"
      >
        {activeTab.content}
      </div>
    </div>
  );
}
