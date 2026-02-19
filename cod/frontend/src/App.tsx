import { Suspense } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import AppShell from "./layout/AppShell";
import ImportPage from "./pages/ImportPage";
import ValidatePage from "./pages/ValidatePage";
import MarketDataPage from "./pages/MarketDataPage";
import ConfigurePage from "./pages/ConfigurePage";
import RunPage from "./pages/RunPage";
import DashboardPage from "./pages/DashboardPage";
import StressPage from "./pages/StressPage";
import LimitsPage from "./pages/LimitsPage";
import ExportPage from "./pages/ExportPage";
import MarginPage from "./pages/MarginPage";
import HedgePage from "./pages/HedgePage";
import WhatIfPage from "./pages/WhatIfPage";
import PlanBPage from "./pages/PlanBPage";
import ActionsPage from "./pages/ActionsPage";
import HelpPage from "./pages/HelpPage";
import PortfolioPage from "./pages/PortfolioPage";
import UiDemoPage from "./pages/UiDemoPage";
import OverviewPage from "./pages/OverviewPage";
import ScenariosPage from "./pages/ScenariosPage";
import GateRoute from "./routes/GateRoute";
import { WorkflowStep } from "./workflow/workflowTypes";

export default function App() {
  return (
    <AppShell>
      <Suspense fallback={<div className="card">Загрузка...</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/calculator" element={<Navigate to="/run?mode=single" replace />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/validate" element={<GateRoute requiredStep={WorkflowStep.Validate}><ValidatePage /></GateRoute>} />
          <Route path="/market" element={<GateRoute requiredStep={WorkflowStep.MarketData}><MarketDataPage /></GateRoute>} />
          <Route path="/configure" element={<GateRoute requiredStep={WorkflowStep.Configure}><ConfigurePage /></GateRoute>} />
          <Route path="/run" element={<GateRoute requiredStep={WorkflowStep.CalcRun}><RunPage /></GateRoute>} />

          <Route path="/dashboard" element={<GateRoute requiredStep={WorkflowStep.Results}><DashboardPage /></GateRoute>} />
          <Route path="/results" element={<GateRoute requiredStep={WorkflowStep.Results}><DashboardPage /></GateRoute>} />
          <Route path="/stress" element={<GateRoute requiredStep={WorkflowStep.Stress}><StressPage /></GateRoute>} />
          <Route path="/limits" element={<GateRoute requiredStep={WorkflowStep.Limits}><LimitsPage /></GateRoute>} />
          <Route path="/margin" element={<GateRoute requiredStep={WorkflowStep.Margin}><MarginPage /></GateRoute>} />
          <Route path="/export" element={<GateRoute requiredStep={WorkflowStep.Export}><ExportPage /></GateRoute>} />
          <Route path="/reports" element={<GateRoute requiredStep={WorkflowStep.Export}><ExportPage /></GateRoute>} />
          <Route path="/actions" element={<GateRoute requiredStep={WorkflowStep.PostActions}><ActionsPage /></GateRoute>} />

          <Route path="/hedge" element={<GateRoute requiredStep={WorkflowStep.PostActions}><HedgePage /></GateRoute>} />
          <Route path="/what-if" element={<GateRoute requiredStep={WorkflowStep.PostActions}><WhatIfPage /></GateRoute>} />
          <Route path="/plan-b" element={<GateRoute requiredStep={WorkflowStep.PostActions}><PlanBPage /></GateRoute>} />

          <Route path="/help" element={<HelpPage />} />
          <Route path="/ui-demo" element={<UiDemoPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
