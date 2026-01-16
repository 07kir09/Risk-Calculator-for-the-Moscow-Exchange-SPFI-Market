import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import WorkflowStepper from "../components/WorkflowStepper";
import NextStepBanner from "../components/NextStepBanner";
import OnboardingModal from "../components/OnboardingModal";

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

  return (
    <div className={`app ${collapsed ? "app--collapsed" : ""}`}>
      <OnboardingModal />
      {mobileOpen && <div className="mobileBackdrop" onClick={() => setMobileOpen(false)} />}
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <Topbar
        title={pageTitle}
        onOpenMobileMenu={() => setMobileOpen(true)}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
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
            <NextStepBanner />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
