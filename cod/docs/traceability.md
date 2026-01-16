# Трассируемость требований → реализация

- Ценообразование опционов (BS/бином/MC): `option_risk/pricing/*`, тесты `tests/test_pricing.py::test_black_scholes_price_matches_reference/test_binomial_converges_to_bs/test_monte_carlo_reasonable`.
- Подразумеваемая волатильность: `pricing/implied_vol.py`, тест `test_implied_volatility_roundtrip`.
- Греки (аналитика/численно): `greeks/analytic.py`, `greeks/numerical.py`, агрегирование `risk/portfolio.py::greeks_summary`.
- Портфельная стоимость и агрегирование: `risk/portfolio.py::portfolio_value`.
- VaR/ES (исторический/параметрический) и LC VaR: `risk/var_es.py`, тест `test_var_es_and_liquidity`.
- Стресс-сценарии и подсветка лимитов: `risk/stress.py`, `risk/limits.py`, CLI опция `--limits`, таблицы отчёта `reporting/generator.py`.
- Валидация дат/валют/чисел/количества: `data/models.py`, загрузка `data/loading.py`, журнал `ValidationMessage`, экспортируется в отчёты.
- Детерминизм вычислений (seed MC): `pricing/monte_carlo.py` (фиксированный seed), документация `README.md`.
- Экспорты CSV/Excel/JSON + график: `reporting/generator.py`, вызывается из `cli.py`.
- Журнал проверок данных: собирается при загрузке (`loading.py`), сохраняется в `validation.csv`/Excel/JSON.
- Требования к отчётам (факт vs лимит, стресс-PnL): таблицы `metrics`, `stress`, `limits`, график PnL.
- Тесты и покрытие граничных случаев: `cod/tests/` (отдельный этап в `docs/plan.md`).
- Исключение hazard rate, нейтральный источник данных, отказ от KPI 1000 записей: зафиксировано в `README.md` и `docs/notes.md`.
- UI (индив. ТЗ фронт): `frontend/` (React+TS, ECharts, SheetJS, React Query, axios); wizard/gating по шагам S1–S11, импорт CSV с drag&drop, лог валидации, каталог стресс‑сценариев, дашборд, лимиты, экспорт, вкладка «Портфель», onboarding‑подсказка.
- Фронтовые тесты (Jest + React Testing Library): `frontend/src/__tests__/flow_import_validation.test.tsx`, `frontend/src/__tests__/flow_config_run_dashboard.test.tsx`, `frontend/src/__tests__/flow_stress.test.tsx`, `frontend/src/__tests__/flow_export.test.tsx`, `frontend/src/__tests__/math.test.ts`.
- DV01 и корреляции: `risk/portfolio.py::dv01_position`, `risk/correlations.py`; тесты `tests/test_pricing.py`.
- Капитал/маржа: `risk/capital_margin.py`, используется в API/CLI.
- FastAPI сервис: `option_risk/api.py` — соответствует требованию на интеграцию backend.
