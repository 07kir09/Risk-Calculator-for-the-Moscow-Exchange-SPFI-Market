import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "../../widgets/app-shell/AppShell";
import { DashboardPage } from "../../pages/DashboardPage";
import { PortfolioBuilderPage } from "../../pages/PortfolioBuilderPage";
import { DataUploadPage } from "../../pages/DataUploadPage";
import { PortfolioRiskPage } from "../../pages/PortfolioRiskPage";
import { ScenarioRiskPage } from "../../pages/ScenarioRiskPage";
import { StressTestingPage } from "../../pages/StressTestingPage";

function ResolveTitle() {
  const { pathname } = useLocation();
  const map: Record<string, string> = {
    "/dashboard": "Дашборд",
    "/portfolio-builder": "Портфель",
    "/data-upload": "Загрузка данных",
    "/portfolio-risk": "Риск портфеля",
    "/scenario-risk": "Сценарный риск",
    "/stress-testing": "Стресс-тесты",
  };
  return <AppShell pageTitle={map[pathname] ?? "Дашборд"} />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<ResolveTitle />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/portfolio-builder" element={<PortfolioBuilderPage />} />
        <Route path="/data-upload" element={<DataUploadPage />} />
        <Route path="/portfolio-risk" element={<PortfolioRiskPage />} />
        <Route path="/scenario-risk" element={<ScenarioRiskPage />} />
        <Route path="/stress-testing" element={<StressTestingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
