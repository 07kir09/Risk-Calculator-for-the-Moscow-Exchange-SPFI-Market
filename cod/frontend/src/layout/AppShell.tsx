import { ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import WorkflowStepper from "../components/WorkflowStepper";
import NextStepBanner from "../components/NextStepBanner";
import OnboardingModal from "../components/OnboardingModal";
import { useAppData } from "../state/appDataStore";
import { useWorkflow } from "../workflow/workflowStore";

const titles: Record<string, string> = {
  "/overview": "Обзор продукта",
  "/calculator": "Калькулятор (single)",
  "/scenarios": "Сценарии и сравнение",
  "/results": "Результаты",
  "/reports": "Отчёты",
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
  const [routeNotice, setRouteNotice] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light"
  );
  const location = useLocation();
  const navigate = useNavigate();
  const { state: dataState, dispatch: dataDispatch } = useAppData();
  const { state: wf, dispatch: wfDispatch } = useWorkflow();

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
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

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

  const hasSessionData = dataState.portfolio.positions.length > 0 || Boolean(dataState.results.metrics) || Boolean(wf.snapshotId);

  const sectionTabs = useMemo(
    () => [
      { to: "/overview", label: "Overview", match: ["/overview"] },
      { to: "/calculator", label: "Calculator", match: ["/calculator", "/import", "/validate", "/market", "/configure", "/run"] },
      { to: "/portfolio", label: "Portfolio", match: ["/portfolio"] },
      { to: "/scenarios", label: "Scenarios", match: ["/scenarios", "/actions", "/what-if", "/hedge", "/plan-b"] },
      { to: "/results", label: "Results", match: ["/results", "/dashboard", "/stress", "/limits", "/margin"] },
      { to: "/reports", label: "Reports", match: ["/reports", "/export"] },
      { to: "/help", label: "Справка", match: ["/help"] },
    ],
    []
  );

  return (
    <div className="productShell">
      <OnboardingModal />
      <header className="productTopbar">
        <div className="productBrand">
          <div className="productBrandKicker">Risk Calculator SPFI</div>
          <div className="productBrandTitle">MOEX SPFI Risk Workbench</div>
        </div>
        <nav className="sectionTabs sectionTabs--top" aria-label="Основные разделы">
          {sectionTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={() =>
                `sectionTab ${tab.match.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`)) ? "sectionTab--active" : ""}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div className="workspaceTopbarActions">
          {hasSessionData && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                dataDispatch({ type: "RESET_ALL" });
                wfDispatch({ type: "RESET_ALL" });
                navigate("/import", { replace: true });
              }}
            >
              Сбросить сессию
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          </button>
        </div>
      </header>

      <div className="productBody">
        <aside className="productRail" data-testid="global-summary-bar">
          <div className="railCard">
            <div className="railCardTitle">Текущая сессия</div>
            <div className="railCardGrid">
              <span className="railStat"><strong>{summary.positions}</strong> позиций</span>
              <span className="railStat"><strong>{summary.baseCurrency}</strong> валюта</span>
              <span className="railStat"><strong>{summary.confidenceLevel.toFixed(4)}</strong> CL</span>
              <span className="railStat"><strong>{summary.horizonDays}d</strong> горизонт</span>
            </div>
            <span className={`badge ${summary.mode === "demo" ? "warn" : "ok"}`}>
              {summary.mode === "demo" ? "demo mode" : "api mode"}
            </span>
          </div>

          <div className="railCard">
            <div className="railCardTitle">Pipeline</div>
            <WorkflowStepper />
          </div>
          <NextStepBanner />
        </aside>

        <main className="productContent">
          <section className="contentIntro">
            <h1 className="contentIntroTitle">{pageTitle}</h1>
            <p className="contentIntroText">Пересобранный интерфейс фокусируется на одном действии за раз: ввод → запуск → KPI → детали.</p>
          </section>

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
          {children}
        </main>
      </div>
    </div>
  );
}
