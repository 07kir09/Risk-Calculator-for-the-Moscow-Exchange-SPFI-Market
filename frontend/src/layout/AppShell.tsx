import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
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

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const media = window.matchMedia("(max-width: 980px)");
    const syncNavigationMode = () => {
      if (media.matches) {
        setCollapsed(false);
        return;
      }
      setMobileOpen(false);
    };

    syncNavigationMode();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncNavigationMode);
      return () => media.removeEventListener("change", syncNavigationMode);
    }

    media.addListener(syncNavigationMode);
    return () => media.removeListener(syncNavigationMode);
  }, []);

  const handleToggleNavigation = () => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 980px)").matches) {
      setCollapsed(false);
      setMobileOpen((v) => !v);
      return;
    }
    setMobileOpen(false);
    setCollapsed((v) => !v);
  };

  return (
    <div className={`app ${collapsed ? "app--collapsed" : ""}`}>
      <div className="appAmbient">
        <div className="appAmbientOrb appAmbientOrb--one" />
        <div className="appAmbientOrb appAmbientOrb--two" />
        <div className="appAmbientGrid" />
      </div>
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, x: 18, y: 18 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: -18, y: -8 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="pageMotion"
              >
                {routeNotice && (
                  <motion.div
                    initial={{ opacity: 0, y: -12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 220, damping: 22 }}
                    className="routeNotice"
                  >
                    <div>
                      <div className="routeNoticeLabel">Подсказка навигации</div>
                      <div className="routeNoticeText">{routeNotice}</div>
                    </div>
                    <button className="topbarGhostButton" onClick={() => setRouteNotice(null)} aria-label="Закрыть сообщение">
                      ×
                    </button>
                  </motion.div>
                )}
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
