= ТЕКСТ ПРОГРАММЫ

== Исходный код программы

#h(2em) Исходный код программы расположен в репозитории:

https://github.com/07kir09/Risk-Calculator-for-the-Moscow-Exchange-SPFI-Market

#h(2em) Рабочая ветка, в которой подготовлен запуск проекта и комплект документации: `v11.3`. Коммит с исправлением запуска: `f6fba5978 Fix project launch script`.

= ОПИСАНИЕ ПРОГРАММЫ

== Описание проекта

#h(2em) Программа Risk Calculator for MOEX SPFI представляет собой web-платформу для загрузки рыночных данных, оценки производных финансовых инструментов, расчета показателей риска портфеля и формирования отчетности. Программа состоит из backend на Python/FastAPI, frontend на React/TypeScript/Vite, CLI-запуска и набора автоматизированных тестов.

== Структура проекта

=== `backend/`

#h(2em) Каталог содержит серверную часть и расчетное ядро. Основной Python-пакет -- `backend/option_risk`.

==== `backend/option_risk/api.py`

#h(2em) FastAPI-сервис. Реализует endpoint'ы `/metrics`, `/market-data/session`, `/market-data/upload`, `/market-data/load-default`, `/market-data/sync-live`, `/market-data/health`, `/market-data/{session_id}`, `/scenarios`, `/limits`, `/health`. В файле также находятся middleware request context, обработчики ошибок, CORS, защита от path traversal и проверки upload.

==== `backend/option_risk/cli.py`

#h(2em) Командная точка входа для расчета. CLI загружает портфель, сценарии, лимиты, optional market data bundle, выполняет расчет и сохраняет CSV, Excel, JSON и PNG-график.

==== `backend/option_risk/data/`

#h(2em) Модуль данных. Включает Pydantic-модели (`models.py`), загрузку CSV/JSON (`loading.py`), загрузку Excel market data (`market_data.py`), управление сессиями (`market_data_sessions.py`), live market data sync (`live_market_data.py`), bootstrap (`bootstrap.py`), calibration (`calibration.py`) и проверку полноты данных (`market_data_completeness.py`).

==== `backend/option_risk/pricing/`

#h(2em) Модуль оценки инструментов. Содержит Black-Scholes (`black_scholes.py`), биномиальную модель (`binomial.py`), Monte Carlo (`monte_carlo.py`), implied volatility (`implied_vol.py`), forward pricing (`forward.py`), swap pricing (`swap_ir.py`), market context (`market.py`) и календарные функции (`calendar.py`).

==== `backend/option_risk/risk/`

#h(2em) Модуль риск-расчетов. Содержит pipeline (`pipeline.py`), VaR/ES (`var_es.py`), portfolio aggregation (`portfolio.py`), stress testing (`stress.py`), limits (`limits.py`), correlations (`correlations.py`) и margin/capital (`capital_margin.py`).

==== `backend/option_risk/greeks/`

#h(2em) Модуль расчета греков: аналитические формулы и численные sensitivities.

==== `backend/option_risk/reporting/generator.py`

#h(2em) Формирует таблицы отчета, сохраняет CSV, Excel, JSON и строит histogram PnL.

=== `frontend/`

#h(2em) Каталог содержит пользовательский интерфейс на React, TypeScript и Vite.

==== `frontend/src/App.tsx`

#h(2em) Описывает маршруты приложения: `/import`, `/validate`, `/market`, `/configure`, `/dashboard`, `/stress`, `/limits`, `/export`, `/portfolio`, `/help`, `/ui-demo`, `/hedge`, `/plan-b`.

==== `frontend/src/pages/`

#h(2em) Содержит страницы workflow. `ImportPage.tsx` отвечает за импорт портфеля; `ValidatePage.tsx` -- за журнал валидации; `MarketDataPage.tsx` -- за market data bundle; `ConfigurePage.tsx` -- за настройки расчета; `DashboardPage.tsx` -- за основные результаты; `StressPage.tsx` -- за стресс-сценарии; `LimitsPage.tsx` -- за лимиты; `ExportPage.tsx` -- за выгрузку отчетов.

==== `frontend/src/api/`

#h(2em) Содержит Axios-клиент, endpoint wrappers, risk service и Zod-контракты API. Клиент добавляет `x-request-id`, использует timeout 180 секунд и нормализует ошибки в `ApiError`.

==== `frontend/src/workflow/` и `frontend/src/state/`

#h(2em) Хранят workflow-состояние и данные приложения в `localStorage`. Workflow задает порядок Import -> Validate -> MarketData -> Configure -> Results -> Stress -> Limits -> Export и блокирует недоступные маршруты через `GateRoute`.

==== `frontend/src/validation/portfolioCsv.ts`

#h(2em) Выполняет CSV-валидацию и нормализацию портфеля, поддерживает обычный формат и русский trade-export формат.

=== `Datasets/`

#h(2em) Каталог содержит примеры и рабочие данные. В `Datasets/examples` находятся `portfolio.csv`, `scenarios.csv`, `limits.json`. В `Datasets/Данные для работы` находятся Excel-файлы market data: `curveDiscount.xlsx`, `curveForward.xlsx`, `fixing.xlsx`, `calibrationInstrument*.xlsx`, `RC_*.xlsx`.

=== `audit_runtime_checks/`

#h(2em) Каталог содержит runtime scripts и отчеты. Скрипты проверяют backend smoke, API contracts, frontend routes, full user flow, negative cases, data API completeness, market data completeness и calculation correctness.

== Основные файлы запуска

==== `run_all.sh`

#h(2em) Единый файл запуска проекта. Создает `.venv`, устанавливает Python-зависимости, запускает backend tests, выполняет CLI demo, поднимает FastAPI на `8000`, устанавливает frontend-зависимости, запускает Jest и поднимает Vite на `5173`.

==== `backend/requirements.txt`

#h(2em) Список Python-зависимостей: NumPy, Pandas, Matplotlib, Pydantic v1, OpenPyXL, pytest, SciPy, FastAPI, Uvicorn, python-multipart.

==== `frontend/package.json`

#h(2em) Список frontend-зависимостей и команд: `npm run dev`, `npm test`, `npm run build`, `npm run preview`, `npm run e2e`.

== API программы

#h(2em) Главный endpoint `/metrics` принимает массив позиций, сценарии, лимиты, параметры расчета, FX rates и market data session id. Ответ включает base value, VaR, ES, LC VaR, Greeks, stress, limits, correlations, PnL distribution, buckets, capital/margin и validation log.

#h(2em) Endpoint'ы `/market-data/*` управляют загрузкой и проверкой рыночных данных. Endpoint `/scenarios` возвращает каталог сценариев, `/limits` -- каталог лимитов, `/health` -- состояние сервиса.

== Тестовая часть программы

#h(2em) Backend-тесты расположены в `backend/tests`. Они покрывают pricing formulas, risk pipeline, API metrics, market data upload/session/security, curve calibration, bootstrap, data completeness, FX pairs, schedule conventions и golden cases.

#h(2em) Frontend-тесты расположены в `frontend/src/__tests__`. Они покрывают импорт портфеля, workflow, dashboard, stress, limits, export, API contracts, math functions и validation log.

#h(2em) Playwright e2e-сценарии находятся в `frontend/e2e/flow.spec.ts` и проверяют пользовательские маршруты "импорт -> расчет -> dashboard" и "dashboard -> stress -> limits -> export".

= СПИСОК ИСПОЛЬЗУЕМОЙ ЛИТЕРАТУРЫ

1. ГОСТ 19.101-77. Виды программ и программных документов.
2. ГОСТ 19.401-78. Текст программы. Требования к содержанию и оформлению.
3. ГОСТ 19.105-78. Единая система программной документации. Общие требования к программным документам.
