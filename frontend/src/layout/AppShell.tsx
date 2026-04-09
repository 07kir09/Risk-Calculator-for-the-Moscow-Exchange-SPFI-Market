import { ReactNode, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Toast } from "@heroui/react";
import Topbar from "./Topbar";
import OnboardingModal from "../components/OnboardingModal";
import { showBlockedNavigationToast } from "../lib/blockedNavigationToast";

const titles: Record<string, string> = {
  "/import": "Импорт сделок",
  "/portfolio": "Портфель",
  "/validate": "Проверка данных",
  "/market": "Связь с рыночными данными",
  "/configure": "Настройка расчёта",
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
  const lastToastTokenRef = useRef<string>("");
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
      const token = `${location.key}|${location.pathname}|${st.reason}`;
      if (lastToastTokenRef.current !== token) {
        lastToastTokenRef.current = token;
        showBlockedNavigationToast(st.reason);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  return (
    <div className="app app--drawerOnly">
      <div className="appAmbient">
        <div className="appAmbientOrb appAmbientOrb--one" />
        <div className="appAmbientOrb appAmbientOrb--two" />
        <div className="appAmbientGrid" />
      </div>
      <OnboardingModal />
      <Toast.Provider placement="bottom" />
      <Topbar title={pageTitle} />
      <main className="appMain">
        <div className="appMainScroll">
          <div className="container">
            <div key={location.pathname} className="pageMotion pageMotion--enter">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
