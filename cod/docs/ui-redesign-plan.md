# UI Redesign Plan (4.1)

## Step 0. Functionality Inventory (contract)

| Feature | Where it lives now | Inputs | Outputs | Dependencies |
|---|---|---|---|---|
| Portfolio import (CSV/demo) | `/import`, `frontend/src/pages/ImportPage.tsx` | CSV file, demo dataset | Parsed positions, validation log preview | `parsePortfolioCsv`, `demoPositions`, AppData store |
| Validation review and gate | `/validate`, `frontend/src/pages/ValidatePage.tsx` | Validation log entries, acknowledgement checkbox | Grouped issue list, severity summary, JSON log export | AppData `validationLog`, Workflow validation state |
| Market data linking readiness | `/market`, `frontend/src/pages/MarketDataPage.tsx` | Imported positions, fetch action | Market readiness state, missing factors count | Workflow market state, downstream reset |
| Calculation configuration | `/configure`, `frontend/src/pages/ConfigurePage.tsx` | Selected metrics, alpha, horizon, history, base currency, FX JSON, liquidity model, scenario presets | Saved calc config, margin flag, persisted presets | Workflow calc config, AppData scenarios, localStorage presets |
| Run calculation (portfolio/single) | `/run`, `frontend/src/pages/RunPage.tsx` | Positions scope, scenarios, selected metrics, limits, config params | Metrics payload, run status, run snapshots for comparison | `runRiskCalculation`, Workflow calc run state, AppData results |
| Results dashboard (KPI + charts + contributors) | `/dashboard` and `/results`, `frontend/src/pages/DashboardPage.tsx` | Metrics response | KPI cards, chart tabs, Greeks, limits preview, LC breakdown, contributors | ECharts options builders, AppData results |
| Stress scenario management | `/stress`, `frontend/src/pages/StressPage.tsx` | Existing scenarios, new scenario draft, delete action | Stress table, top stress contributors, recomputed metrics | AppData scenarios/results, `runRiskCalculation` |
| Limits overview | `/limits`, `frontend/src/pages/LimitsPage.tsx` | Limits tuple list from metrics | Fact vs limit table with breach status | AppData results |
| Margin/capital view | `/margin`, `frontend/src/pages/MarginPage.tsx` | Margin-enabled config, metrics | Initial/variation margin and capital cards | Workflow margin flag, AppData results |
| Export/report builder | `/export` and `/reports`, `frontend/src/pages/ExportPage.tsx` | Selected report sections, metrics, params, validation log | XLSX/JSON files | `xlsx`, browser blob download |
| Portfolio explorer | `/portfolio`, `frontend/src/pages/PortfolioPage.tsx` | Imported positions, sort key, density | Sorted responsive table | AppData portfolio |
| Post-analysis hub | `/actions`, `frontend/src/pages/ActionsPage.tsx` | Calculated results | Navigation to What-if, Hedge, Plan B | Workflow PostActions step |
| What-if sandbox | `/what-if`, `frontend/src/pages/WhatIfPage.tsx` | Position edits, added hedge positions, scenarios | Before/after metrics comparison, JSON of changes | `runRiskCalculation`, AppData base metrics |
| Hedge suggestion workflow | `/hedge`, `frontend/src/pages/HedgePage.tsx` | Current Greeks/DV01/Vega, hedge percent | Draft hedge positions sent to What-if | `runRiskCalculation`, AppData results |
| Plan B checklist | `/plan-b`, `frontend/src/pages/PlanBPage.tsx` | Limit breaches, stress losses, task checkboxes | Action plans with persisted checklist state | AppData results, localStorage plan state |
| Home / overview and quick start | `/overview`, `frontend/src/pages/OverviewPage.tsx` | Session state, selected mode | Quick-start CTA, session status, latest KPI snapshot | Workflow/AppData stores, run history localStorage |
| Saved scenarios & run comparison | `/scenarios`, `frontend/src/pages/ScenariosPage.tsx` | Saved presets, run snapshots, compare selection | Preset list, KPI delta table for last runs | localStorage (`risk_ui_config_presets_v1`, `risk_ui_run_history_v1`) |
| Help / glossary | `/help`, `frontend/src/pages/HelpPage.tsx` | Static copy | User guidance and term explanations | none |

## Discovery: User-facing routes and flows

Current routed screens:
- `/overview`, `/calculator`, `/import`, `/validate`, `/market`, `/configure`, `/run`
- `/results`, `/dashboard`, `/stress`, `/limits`, `/margin`
- `/reports`, `/export`, `/portfolio`, `/scenarios`
- `/actions`, `/what-if`, `/hedge`, `/plan-b`, `/help`, `/ui-demo`

Top UX issues identified:
1. Too many workflow screens were visible as peers, while users need product-level sections first.
2. “Primary action” was diluted by multiple equal CTAs inside each page.
3. Advanced settings were always mixed with core fields.
4. Empty/loading/error behaviors were inconsistent between pages.
5. Scenario persistence existed, but there was no dedicated compare view.

## Step 1. New IA + Flows

### Sitemap (product sections)
- **Overview** (`/overview`): hero, quick start, status, latest KPI snapshot.
- **Calculator** (`/calculator` + workflow steps `/import`..`/run`): single and portfolio execution path.
- **Portfolio** (`/portfolio`): positions management and data quality visibility.
- **Scenarios** (`/scenarios`): saved config presets + run comparison.
- **Results** (`/results`/`/dashboard` + `/stress` + `/limits` + `/margin`).
- **Reports** (`/reports`/`/export`).
- **Support** (`/help`).

### Core flows
1. **Quick start flow**
   - `/overview` -> choose mode (single/portfolio) -> `/import` -> `/validate` -> `/market` -> `/configure` -> `/run` -> `/results`.
2. **Advanced mode flow**
   - `/configure` -> open `Advanced settings` drawer -> set FX/liquidity/presets -> save + run.
3. **Results-first flow**
   - `/results` always starts with KPI cards and dedicated visual result panel; details stay below.
4. **Scenario compare flow**
   - `/configure` save preset -> `/run` successful snapshot -> `/scenarios` compare last two runs.
5. **Export flow**
   - `/results` -> `/reports` choose sections -> download JSON/XLSX.

### Screen list
- OverviewPage
- ImportPage
- ValidatePage
- MarketDataPage
- ConfigurePage
- RunPage
- DashboardPage
- StressPage
- LimitsPage
- MarginPage
- PortfolioPage
- ScenariosPage
- ExportPage
- ActionsPage / WhatIfPage / HedgePage / PlanBPage
- HelpPage

## Step 2. Page Wireframe Block Specs

### Overview (`/overview`)
- HERO: product title, one-line value, primary CTA “Перейти к расчёту”, secondary CTA “Открыть результаты”.
- MODE SWITCH: portfolio/single segmented control.
- QUICK START STATUS: next-step banner with route-aware CTA.
- RESULTS SUMMARY: KPI cards from latest run if available.
- RECENT RUN: latest run card with timestamp and VaR/ES mini stats.

### Calculator workflow

#### Import (`/import`)
- PAGE HEADER: title + demo/template actions.
- INPUT PANEL: drag-and-drop CSV + supported types.
- VALIDATION PRECHECK: errors/warnings counters.
- PREVIEW TABLE: first 50 positions.
- PRIMARY ACTION: continue to validation.

#### Validate (`/validate`)
- PAGE HEADER: explanation + download log.
- SUMMARY PANEL: critical/warnings + acknowledgement checkbox.
- ISSUE GROUPS: grouped errors with fix hints.
- PRIMARY ACTION: continue to market data.

#### Market (`/market`)
- PAGE HEADER: dependency explanation.
- STATUS PANEL: market linkage status.
- FACTOR READINESS CARD: counts and fetch action.
- EXPLAINER CARD: plain-language factor mapping.
- PRIMARY ACTION: continue to configure.

#### Configure (`/configure`)
- PAGE HEADER: recommended set/reset/back.
- METRIC SELECTION BLOCK: checklist with tooltips.
- INPUT PANEL: alpha, horizon, history, base currency with units/validation.
- ADVANCED DRAWER: FX JSON, liquidity model, save/apply preset.
- SCENARIO PREVIEW: top stress scenarios list.
- PRIMARY ACTION: save config and continue to run.

#### Run (`/run`)
- PAGE HEADER: launch context.
- MODE SWITCH: portfolio/single, single position picker.
- STICKY ACTION PANEL: run summary + primary run CTA.
- RESULT PREVIEW PANEL: selected metrics and latest run preview.
- PRIMARY ACTION: run calculation.

### Results (`/results` / `/dashboard`)
- PAGE HEADER: quick links to stress/limits/export.
- KPI SUMMARY: 3–8 cards (PV, VaR, ES, LC VaR, stress worst, margin).
- RESULT PANEL: chart tabs and active visual.
- DETAIL TABLES: Greeks, limits summary, LC breakdown, contributors.
- EXPLAINERS: tooltips for metric meaning and methodology notes.

### Stress (`/stress`)
- HEADER + refresh action.
- STRESS RESULTS TABLE.
- TOP CONTRIBUTORS TABLE.
- SCENARIO EDITOR + CRUD list.

### Limits (`/limits`)
- HEADER.
- LIMITS TABLE fact vs limit.
- CTA to export/hedge.

### Portfolio (`/portfolio`)
- HEADER.
- TABLE CONTROLS: density segmented control + sort actions.
- DATA TABLE with responsive overflow.

### Scenarios (`/scenarios`)
- HEADER with primary CTA “Создать сценарий”.
- SAVED CONFIG TABLE (from presets).
- RUN COMPARE PANEL: pick run A/B.
- KPI DELTA TABLE.
- ACTIONS: jump to results or reports.

### Reports (`/reports` / `/export`)
- HEADER.
- SECTION SELECTOR (checkboxes).
- EXPORT ACTIONS (Excel/JSON).
- DATA PRESENCE SUMMARY.

## Step 3. Component System Overview

Implemented reusable primitives (`frontend/src/ui/`):
- `AppShell` (layout + section navigation).
- `PageHeader` (kicker, title, subtitle, CTA area).
- `Section` (title/helper/actions/body block).
- `FormField` (label, helper, unit, error).
- `SegmentedControl`.
- `KpiCard`.
- `ResultPanel` (summary + details area).
- `DataTable` (responsive table with empty state).
- `StatePanel` and `ErrorState`.
- `ToastProvider`/`useToast`.
- `Skeleton`.
- `AdvancedSettings` accordion.
- `ErrorBoundary` (root fallback).

Accessibility baseline:
- focus-visible ring on controls,
- ARIA labels for segmented controls/tablist,
- semantic headers/sections,
- keyboard toggles for advanced drawer and chart tabs.

Responsive behavior:
- desktop: two-column analytical panels and sticky run action card,
- mobile: section tabs wrap, cards stack, table containers preserve horizontal scroll,
- advanced settings collapsible by default.

## Step 4. Implementation Notes (preserving logic)

- Business logic and API contracts were preserved.
- Existing workflow gates remain (`GateRoute`) so calculations cannot run with incomplete upstream steps.
- New product sections are route aliases/wrappers over existing logic, not a rewrite of formulas.
- Local storage contracts added for scenarios/run compare:
  - `risk_ui_config_presets_v1`
  - `risk_ui_run_history_v1`

## Step 5. QA checklist

- [x] All inventory features still present.
- [x] New IA sections and routes added.
- [x] Primary action and dedicated results region on key pages.
- [x] Empty/loading/error states normalized with reusable components.
- [x] Scenario saving and compare (last runs) available.
- [x] Responsive behavior retained.
