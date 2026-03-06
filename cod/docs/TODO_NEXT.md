# TODO Next (driven by `frontend_spec_option_risk.md`)

## Current sprint

1. Done: rebuilt frontend architecture by spec sections.
2. Done: added design tokens and unified shell theme.
3. Done: implemented API client with request IDs, error normalization, timeout, abort.
4. Done: implemented Zustand draft/result/meta store with run statuses.
5. Done: implemented shell, builder, upload, dashboard, portfolio/scenario/stress pages.
6. Done: implemented global search + table filter presets for positions/scenarios.
7. Done: implemented virtualized rows for large positions/scenarios tables.
8. Done: added missing exports (stress/contributors CSV) and request meta in debug drawer.
9. Done: closed accessibility baseline (focus-visible, aria labels, focus tooltip targets).
10. Done: tests/build are green.
11. Done: implemented `Base vs Stress` main chart for Stress Testing (`§19.5`).
12. Done: added table column resize + keyboard navigation for positions/scenarios (`§37.1`).
13. Done: moved chart/state colors to design tokens and reduced component-level color hardcode.
14. Done: removed static inline styles from pages/widgets/features; moved layout/spacing/active states to tokenized utility classes in `base.css`.
15. Done: re-validated frontend (`npm test -- --runInBand`, `npm run build`) after style refactor.
16. Done: completed strict `0 inline style` pass in `frontend/src` (including dynamic widths/heatmap), switched to class/attribute-driven rendering.
17. Done: re-validated frontend again after strict pass (`npm test -- --runInBand`, `npm run build`).
18. Done: implemented universal CSV ingest path (header aliases RU/EN, robust number parsing, `DD.MM.YYYY -> ISO` conversion, instrument type inference, sanitized header parsing in dropzone).
19. Done: relaxed client validation for non-option instruments (`strike` only required for option, maturity date allows same-day).
20. Done: added import helper tests (`src/__tests__/csvImport.test.ts`) and re-validated build/tests.
21. Done: completed Russian-facing localization pass for pages/widgets/forms (including scenario modal, run-config options, metadata labels, liquidity labels).
22. Done: compacted filter UX into unified chip strips (portfolio/scenario risk metrics, positions/scenarios tables, upload import mode, run-config calculation blocks).
23. Done: re-validated frontend after localization/filter pass (`npm test -- --runInBand`, `npm run build`).
24. Done: fixed CSV date import regressions by improving mapping and parser (`maturity_date` no longer auto-picks `Срок`, supports mixed date formats and tenors like `2W`, `6M`, `3Y`).
25. Done: added fallback normalization for `underlying_price` from strike/notional and expanded CSV tests for tenor-based maturity parsing.
26. Done: re-validated frontend after CSV import hardening (`npm test -- --runInBand`, `npm run build`).
27. Done: diagnosed recurring `422 /api/metrics` causes and aligned frontend with backend validation rules (strict date ordering, positive strike for all instruments, non-negative notional/liquidity_haircut).
28. Done: hardened CSV mapping to avoid row-level alias drift when explicit mapping exists; prevented accidental pull of `Комиссии` into liquidity haircut.
29. Done: added regression tests for trade-style rows (`Дата регистрации` priority, non-option strike fallback, stable maturity parsing).
30. Done: improved 422 parsing in API client for root-level backend validators (`__root__` -> human-readable field label).
31. Done: fixed chart layout degradation on large datasets (adaptive X-axis density, label truncation, heatmap compact/dense rendering, bounded heatmap height with scroll, anti-overflow grid min-width rules).
32. Done: re-validated frontend after large-data chart fixes (`npm test -- --runInBand`, `npm run build`).
33. Done: fixed large-number visual overflow in cards/tables/chips (ellipsis + numeric typography in KPI/metric/table values, safe clipping for badges/filter pills, table-resizable cell overflow control).
34. Done: re-validated frontend after large-number overflow fixes (`npm test -- --runInBand`, `npm run build`).
35. Done: added a realistic small human-style portfolio sample for quick import/demo (`examples/portfolio_human_realistic.csv`) with mixed instruments (options, forwards, IRS/OIS/XCCY).

## Immediately next

- Manual visual QA pass against `frontend_spec_option_risk.md` screenshots/spacing.
- Optional: split big JS bundle via route-level lazy loading (current build warns about chunk >500kb).
- Add extended test coverage for table presets/search and CSV export actions.
- Keep `docs/REQUIREMENTS_MAP.md` in sync after any further change.
