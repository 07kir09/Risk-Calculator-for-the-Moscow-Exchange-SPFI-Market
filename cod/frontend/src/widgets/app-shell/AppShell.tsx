import { Outlet } from "react-router-dom";
import { Sidebar } from "../sidebar/Sidebar";
import { Topbar } from "../topbar/Topbar";
import { DebugDrawer } from "../debug-drawer/DebugDrawer";
import { RunConfigDrawer } from "../../features/run-config/RunConfigDrawer";
import { useHealthQuery } from "../../shared/api/hooks";
import { useRiskStore } from "../../app/store/useRiskStore";
import { useEffect } from "react";

type AppShellProps = {
  pageTitle: string;
};

export function AppShell({ pageTitle }: AppShellProps) {
  const setConnected = useRiskStore((state) => state.setConnected);
  const setLastHealthCheckAt = useRiskStore((state) => state.setLastHealthCheckAt);
  const healthQuery = useHealthQuery();

  useEffect(() => {
    if (healthQuery.isSuccess) {
      setConnected(healthQuery.data.data.status === "ok");
      setLastHealthCheckAt(Date.now());
    }
    if (healthQuery.isError) {
      setConnected(false);
      setLastHealthCheckAt(Date.now());
    }
  }, [healthQuery.data, healthQuery.isError, healthQuery.isSuccess, setConnected, setLastHealthCheckAt]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar pageTitle={pageTitle} />
        <main className="content-body">
          <Outlet />
        </main>
      </div>
      <DebugDrawer />
      <RunConfigDrawer />
    </div>
  );
}
