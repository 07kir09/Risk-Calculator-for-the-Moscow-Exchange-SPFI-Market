# Frontend Requirements Map (source: `frontend_spec_option_risk.md`)

Legend:
- `Status`: `todo` | `in_progress` | `done` | `deferred`
- `Implemented in`: primary files/modules

| ID | Spec ref | Requirement | Implemented in | Status |
|---|---|---|---|---|
| R-001 | §3 | App routes and sidebar sections (`/dashboard`, `/portfolio-builder`, `/data-upload`, `/portfolio-risk`, `/scenario-risk`, `/stress-testing`) | `frontend/src/app/router/AppRouter.tsx`, `frontend/src/widgets/sidebar/Sidebar.tsx` | done |
| R-002 | §3 | Global state: drafts, result, status, request/trace ids, dirty flags, connection status | `frontend/src/app/store/useRiskStore.ts` | done |
| R-003 | §4-6 | Unified dark design system with tokens; no style hardcode | `frontend/src/styles/tokens.css`, `frontend/src/styles/base.css`, tokenized layout utility classes in pages/widgets/features/charts (`style={{...}}` removed from `frontend/src`), large-number overflow safety for KPI/badges/tables (`numeric-value`, clipped badge/filter-stat text, table-resizable ellipsis) | done |
| R-004 | §7-8 | Project architecture by layers (app/pages/widgets/features/entities/shared) | `frontend/src/*` | done |
| R-005 | §10-11 | Typed API contracts + single api client + request id + error normalization + timeout + abort | `frontend/src/shared/api/*`, `frontend/src/shared/types/contracts.ts` | done |
| R-006 | §12 | Global UX states: loading/empty/partial/success-with-warnings | pages + cards + validation log | done |
| R-007 | §13 | App shell: sidebar + topbar + health indicator + run status chip | `frontend/src/widgets/app-shell/AppShell.tsx` | done |
| R-008 | §14 | Dashboard layout with KPIs, risk distribution, contribution chart, summaries | `frontend/src/pages/DashboardPage.tsx` | done |
| R-009 | §15 | Portfolio Builder with tabs (Positions, Scenarios, Limits, Run Config) | `frontend/src/pages/PortfolioBuilderPage.tsx` | done |
| R-010 | §15 | Positions table actions (sort, columns, select, duplicate, delete, bulk delete, modal edit) | `frontend/src/features/positions/PositionsTable.tsx` | done |
| R-011 | §15 | Position modal dynamic fields by instrument type + client validation rules | `frontend/src/features/positions/PositionFormModal.tsx`, `frontend/src/shared/lib/validation.ts` | done |
| R-012 | §15 | Scenarios table + weighted mode + normalize probabilities helper | `frontend/src/features/scenarios/ScenariosTable.tsx` | done |
| R-013 | §15 | Limits editor + defaults + clear + stress limits by scenario | `frontend/src/features/limits/LimitsEditor.tsx` | done |
| R-014 | §15,20 | Run Config panel + settings drawer + FX rates editor | `frontend/src/features/run-config/*` | done |
| R-015 | §16 | Data Upload: dropzone, preview, mapping panel, validation review, import to draft | `frontend/src/pages/DataUploadPage.tsx`, `frontend/src/features/upload/*`, `frontend/src/shared/lib/csvImport.ts` (header aliases, robust number parsing, multi-format date parsing, tenor-to-date fallback, instrument inference) | done |
| R-016 | §17 | Portfolio Risk page with tabs, distribution, correlation heatmap, key risk table, liquidity table, sensitivities | `frontend/src/pages/PortfolioRiskPage.tsx` | done |
| R-017 | §18 | Scenario Risk page with scenario table, selection, contributors switch, buckets section | `frontend/src/pages/ScenarioRiskPage.tsx` | done |
| R-018 | §19 | Stress Testing page with control panel modes, stress chart, losses table, badges | `frontend/src/pages/StressTestingPage.tsx`, `frontend/src/charts/BaseStressComparisonChart.tsx` | done |
| R-019 | §21 | Exact data-to-UI mapping for all result fields | `frontend/src/features/calculations/resultMappers.ts` | done |
| R-020 | §22 | Unified formatters for money/percents/rates/null handling | `frontend/src/shared/formatters/numberFormat.ts` | done |
| R-021 | §23 | Client and request validation errors stored separately; 422 path mapping | `frontend/src/app/store/useRiskStore.ts`, `frontend/src/shared/api/apiClient.ts`, `frontend/src/shared/lib/validation.ts` (aligned with backend constraints: strike>0 for all, maturity_date>valuation_date, non-negative notional/liquidity_haircut) | done |
| R-022 | §24 | Validation log panel with severity grouping + fx/methodology highlights | `frontend/src/widgets/validation-log/ValidationLogPanel.tsx` | done |
| R-023 | §25 | Debug panel with raw req/resp, ids, status, latency, copy actions | `frontend/src/widgets/debug-drawer/DebugDrawer.tsx`, `frontend/src/widgets/request-debug/RequestMetaPanel.tsx` | done |
| R-024 | §26 | Calculate CTA behavior and disable rules; keep draft on failures | `frontend/src/features/calculations/CalculateButton.tsx`, `frontend/src/app/store/useRiskStore.ts` | done |
| R-025 | §27 | Query/store strategy (React Query + Zustand split) | `frontend/src/app/providers/AppProviders.tsx`, `frontend/src/shared/api/hooks.ts`, `frontend/src/app/store/useRiskStore.ts` | done |
| R-026 | §28 | Chart behavior: dark theme, tooltips, responsive, null-safe | `frontend/src/charts/*`, `frontend/src/styles/base.css` (large-data anti-overflow: adaptive axis density, heatmap compact/dense modes, grid min-width guards) | done |
| R-027 | §29 | Search/filter/sort in positions/scenarios | `frontend/src/widgets/topbar/Topbar.tsx`, `frontend/src/features/positions/PositionsTable.tsx`, `frontend/src/features/scenarios/ScenariosTable.tsx` | done |
| R-028 | §30 | Export JSON/CSV for drafts and key tables | `frontend/src/features/calculations/CalculationActions.tsx` | done |
| R-029 | §31 | Screen-specific empty states text | dashboard/positions/scenarios/limits/correlation/stress empty states | done |
| R-030 | §32 | Required component inventory implemented | `frontend/src/widgets/{app-shell,status,kpi-card,metric-card,chart-card,table-card,empty-state-card}/*`, forms/tables/charts/support modules | done |
| R-031 | §35 | Scenario order preservation for calculate payload mapping | `frontend/src/features/calculations/CalculateButton.tsx` | done |
| R-032 | §36 | Request/trace id visible in error and warning flows | `frontend/src/widgets/request-debug/RequestMetaPanel.tsx`, builder error banners | done |
| R-033 | §37 | Performance basics: memoization, virtualized tables, optimized heatmap path | virtualized + keyboard navigable + resizable `PositionsTable` and `ScenariosTable`, memoized selectors/charts, optimized heatmap grid | done |
| R-034 | §38 | Safe error state keeps previous result with `Outdated` badge | `frontend/src/app/store/useRiskStore.ts` | done |
| R-035 | §39 | Accessibility baseline (focus, aria labels, contrast, focus tooltips) | focus-visible styles, `aria-label` for icon/heatmap/health elements, keyboard-selectable table rows, focusable tooltip targets | done |
| R-036 | §4, §27 + UX addendum | Russian-facing UI text + compact filter controls (chips/compact strips) without breaking API enums | localized pages/widgets/features, compact filter styles in `frontend/src/styles/base.css`, filter blocks in `PositionsTable`, `ScenariosTable`, `PortfolioRiskPage`, `ScenarioRiskPage`, `DataUploadPage`, `RunConfigPanel` | done |
