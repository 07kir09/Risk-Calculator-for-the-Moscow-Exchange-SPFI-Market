import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import WorkflowStepper from "../components/WorkflowStepper";
import NextStepBanner from "../components/NextStepBanner";
import OnboardingModal from "../components/OnboardingModal";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";

const titles: Record<string, string> = {
  "/import": "Импорт сделок",
  "/portfolio": "Портфель",
  "/validate": "Проверка данных",
  "/market": "Связь с рыночными данными",
  "/configure": "Настройка расчёта",
  "/run": "Запуск расчёта",
  "/dashboard": "Панель риска",
  "/stress": "Стресс‑сценарии",
  "/limits": "Лимиты",
  "/margin": "Маржа и капитал",
  "/export": "Отчёты и экспорт",
  "/actions": "What‑if / Хедж / План B",
  "/help": "Справка",
  "/login": "Вход",
};

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { state: dataState } = useAppData();
  const { state: wf } = useWorkflow();

  const pageTitle = useMemo(() => {
    const exact = titles[location.pathname];
    if (exact) return exact;
    const base = Object.entries(titles).find(([path]) => path !== "/" && location.pathname.startsWith(path));
    return base?.[1] ?? "Риск‑калькулятор";
  }, [location.pathname]);

  useEffect(() => {
    const st: any = location.state;
    if (st?.reason && typeof st.reason === "string") {
      setRouteNotice(st.reason);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const summary = useMemo(() => {
    const m = dataState.results.metrics;
    const env = ((import.meta as any).env ?? {}) as Record<string, any>;
    const fallbackMode = (env.VITE_DEMO_MODE ?? "1") === "1" ? "demo" : "api";
    return {
      positions: dataState.portfolio.positions.length,
      baseCurrency: String(m?.base_currency ?? wf.calcConfig.params?.baseCurrency ?? "RUB").toUpperCase(),
      confidenceLevel: Number(m?.confidence_level ?? wf.calcConfig.params?.alpha ?? 0.99),
      horizonDays: Number(m?.horizon_days ?? wf.calcConfig.params?.horizonDays ?? 10),
      mode: String(m?.mode ?? fallbackMode),
    };
  }, [dataState.portfolio.positions.length, dataState.results.metrics, wf.calcConfig.params]);

  const handleToggleNavigation = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 980px)").matches) {
      setMobileOpen((v) => !v);
      return;
    }
    setCollapsed((v) => !v);
  };

  return (
    <div className={`app ${collapsed ? "app--collapsed" : ""}`}>
      <OnboardingModal />
      {mobileOpen && <div className="mobileBackdrop" onClick={() => setMobileOpen(false)} />}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <Topbar
        title={pageTitle}
        onToggleNavigation={handleToggleNavigation}
      />
      <main className="appMain">
        <div className="appMainScroll">
          <div className="container">
            {routeNotice && (
              <div className="card">
                <div className="row wrap" style={{ justifyContent: "space-between" }}>
                  <div>
                    <div className="badge warn">Навигация</div>
                    <div style={{ marginTop: 8 }}>{routeNotice}</div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setRouteNotice(null)}>
                    Понятно
                  </button>
                </div>
              </div>
            )}
            <WorkflowStepper />
            <div className="summaryBar" data-testid="global-summary-bar">
              <span className="summaryItem">N positions: <span className="code">{summary.positions}</span></span>
              <span className="summaryItem">Base currency: <span className="code">{summary.baseCurrency}</span></span>
              <span className="summaryItem">CL: <span className="code">{summary.confidenceLevel.toFixed(4)}</span></span>
              <span className="summaryItem">Horizon: <span className="code">{summary.horizonDays}d</span></span>
              <span className="summaryItem">Mode: <span className={`badge ${summary.mode === "demo" ? "warn" : "ok"}`}>{summary.mode}</span></span>
            </div>
            <NextStepBanner />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
