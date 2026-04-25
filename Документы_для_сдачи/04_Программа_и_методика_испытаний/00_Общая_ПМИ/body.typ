= ПРОГРАММА И МЕТОДИКА ИСПЫТАНИЙ

== Объект испытаний

#h(2em) Объектом испытаний является программная система Risk Calculator for MOEX SPFI, включающая backend `backend/option_risk`, frontend `frontend/src`, CLI `backend/option_risk/cli.py`, единый запуск `run_all.sh`, тестовые данные `Datasets` и runtime audit checks `audit_runtime_checks`.

== Цель испытаний

#h(2em) Цель испытаний -- подтвердить, что программа выполняет основные функции, заявленные в техническом задании: импорт портфеля, валидацию, загрузку market data, расчет риск-метрик, отображение результатов, стресс-анализ, лимиты, экспорт и обработку ошибочных входных данных.

== Проверяемые требования

#h(2em) В рамках испытаний проверяются следующие требования:

- backend рассчитывает portfolio value, VaR/ES, LC VaR, Greeks, stress, limits, correlations и margin/capital;
- API `/metrics` принимает валидный payload и возвращает структурированный `MetricsResponse`;
- API диагностирует невалидный портфель и отсутствие FX-покрытия;
- market data upload принимает корректные XLSX и отклоняет поврежденные, пустые или слишком большие файлы;
- frontend проводит пользователя по workflow Import -> Validate -> MarketData -> Configure -> Dashboard -> Stress -> Limits -> Export;
- экспорт формирует Excel и JSON;
- единый запуск поднимает backend на `8000` и frontend на `5173`;
- runtime audit checks фиксируют результаты по API, backend, frontend, security и data completeness.

== Средства испытаний

#h(2em) Для испытаний используются:

- `pytest` для backend unit/integration тестов;
- `npm test` для frontend тестов на Jest и React Testing Library;
- `bash run_all.sh` для комплексной проверки запуска;
- `curl` для проверки `GET /health` и доступности Vite;
- scripts из `audit_runtime_checks/scripts`;
- тестовые данные из `Datasets/examples` и `audit_runtime_checks/test_data`.

== Порядок проведения испытаний

=== Комплексный запуск

#h(2em) Из корня проекта выполняется команда:

```bash
bash run_all.sh
```

#h(2em) Ожидаемый результат: команда завершается с кодом 0, backend tests проходят, CLI demo выполняется на bundled market data, FastAPI запускается, frontend tests проходят, Vite запускается.

=== Проверка backend

#h(2em) Из каталога `backend` выполняется:

```bash
PYTHONPATH=. pytest tests -q
```

#h(2em) Проверяются pricing formulas, risk pipeline, API `/metrics`, market data upload/session/security, curve calibration, data API completeness, schedule conventions, default inputs и golden cases.

=== Проверка frontend

#h(2em) Из каталога `frontend` выполняется:

```bash
npm test
```

#h(2em) Проверяются импорт CSV/XLSX/paste, workflow import/validation/config/dashboard/export/stress/limits, API contracts, math functions, dashboard refresh и validation log.

=== Проверка доступности сервисов

#h(2em) После `run_all.sh` выполняется проверка:

```bash
curl -fsS http://127.0.0.1:8000/health
curl -I -fsS http://127.0.0.1:5173/
```

#h(2em) Ожидаемый результат: API возвращает `{"status":"ok"}`, frontend возвращает HTTP 200.

=== Runtime audit checks

#h(2em) При запущенных backend и frontend выполняются проверки из `audit_runtime_checks/scripts`: `backend_smoke_check.py`, `api_contract_check.py`, `frontend_route_check.py`, `full_user_flow_check.py`, `negative_cases_check.py`, `data_api_completeness_check.py`, `market_data_completeness_check.py`, `calculation_correctness_check.py`.

== Фактические результаты контрольного запуска

#h(2em) При проверке текущей версии проекта `bash run_all.sh` завершился успешно. Backend: 72 passed, 10 skipped. Frontend: 15 passed test suites, 55 passed tests. API health endpoint вернул `{"status":"ok"}`. Vite frontend ответил HTTP 200.

#h(2em) Готовые runtime-отчеты в `audit_runtime_checks/reports` фиксируют следующие результаты: API contract -- 16 PASS; backend runtime -- 13 PASS; frontend runtime -- 28 PASS; final audit -- 8 PASS; regression security -- 14 PASS; data API completeness -- 39 PASS; calculation correctness -- 17 PASS; market data completeness -- 2 PASS.

== Критерии приемки

#h(2em) Испытания считаются успешными, если все обязательные тестовые команды завершаются без ошибок, API и frontend доступны после запуска, валидный портфель рассчитывается, невалидные данные отклоняются с диагностируемыми ошибками, market data completeness проверяется до production-style расчета, а экспорт отчетов формируется.

= СПИСОК ИСПОЛЬЗУЕМОЙ ЛИТЕРАТУРЫ

1. ГОСТ 19.301-79. Программа и методика испытаний. Требования к содержанию и оформлению.
2. ГОСТ 19.105-78. Единая система программной документации. Общие требования к программным документам.
