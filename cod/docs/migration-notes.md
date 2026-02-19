# UI Migration Notes (v4.1)

## 1) Old -> New mapping

| Old route/area | New product section | Notes |
|---|---|---|
| `/import`, `/validate`, `/market`, `/configure`, `/run` | Calculator | Core wizard kept, wrapped by product-level navigation and quick-start entry points. |
| `/dashboard` | Results (`/results`) | `/results` now aliases dashboard; KPI-first structure preserved. |
| `/export` | Reports (`/reports`) | `/reports` aliases export builder. |
| (no dedicated home) | Overview (`/overview`) | New hero + status + quick start + recent run snapshot. |
| Configure local presets only | Scenarios (`/scenarios`) | New dedicated page for saved presets + run comparison. |
| `/actions`, `/what-if`, `/hedge`, `/plan-b` | Scenarios/Post-actions cluster | Kept as advanced toolkit after base results. |

## 2) New storage contracts

- `risk_ui_config_presets_v1`: saved calculation presets from configure.
- `risk_ui_run_history_v1`: successful run snapshots (up to 24 records) for compare view.

Implementation location:
- `frontend/src/lib/scenarios.ts`

## 3) New reusable UI primitives

Added in `frontend/src/ui/`:
- `PageHeader.tsx`
- `Section.tsx`
- `FormField.tsx`
- `ResultPanel.tsx`
- `DataTable.tsx`
- `AdvancedSettings.tsx`
- `Skeleton.tsx`
- `ErrorState.tsx`
- `ErrorBoundary.tsx`

Existing primitives retained and reused:
- `Card.tsx`
- `StatePanel.tsx`
- `KpiCard.tsx`
- `SegmentedControl.tsx`
- `Toast.tsx`

## 4) Key rewired screens

- `frontend/src/layout/AppShell.tsx`
  - new product section tabs: Overview/Calculator/Portfolio/Scenarios/Results/Reports.

- `frontend/src/App.tsx`
  - added routes: `/overview`, `/calculator`, `/scenarios`, `/results`, `/reports`.
  - root now redirects to `/overview`.

- `frontend/src/pages/OverviewPage.tsx`
  - new landing with quick-start mode, session readiness, KPI preview.

- `frontend/src/pages/ScenariosPage.tsx`
  - new compare view for saved runs and config presets.

- `frontend/src/pages/RunPage.tsx`
  - supports mode via query (`?mode=single`), persists successful runs to history.

- `frontend/src/pages/ConfigurePage.tsx`
  - advanced settings collapsed by default, shared preset storage helpers.

- `frontend/src/pages/DashboardPage.tsx`
  - results panelized, skeleton shown during running state.

- `frontend/src/pages/PortfolioPage.tsx`
  - migrated to reusable `DataTable`.

## 5) How to extend UI safely

1. Add visual blocks through `frontend/src/ui/` primitives first; avoid one-off layout patterns in pages.
2. Keep all workflow validations in `workflowStore` and keep route gates in `GateRoute`.
3. If a new feature needs persistence, define a storage key and helper in `frontend/src/lib/scenarios.ts` or adjacent `lib/*` module.
4. For any new data-heavy page, implement all four states: loading, empty, error, success.
5. Preserve business contracts in `frontend/src/api/contracts/metrics.ts` and rewire UI around them instead of changing payload shape.

## 6) Visual walkthrough (after redesign)

- Overview: product hero + quick start + latest risk snapshot.
- Calculator: focused wizard path with progressive advanced configuration.
- Results: KPI-first, charts in dedicated result panel, details below.
- Scenarios: saved presets and side-by-side KPI deltas for last runs.
- Reports: explicit section picker and deterministic exports.
