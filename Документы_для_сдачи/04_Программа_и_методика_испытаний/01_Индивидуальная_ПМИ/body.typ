= ПРОГРАММА И МЕТОДИКА ИСПЫТАНИЙ. ИНДИВИДУАЛЬНАЯ ЧАСТЬ

== Объект индивидуальных испытаний

#h(2em) Объектом индивидуальных испытаний является серверная часть и интеграционный контур проекта: FastAPI-сервис, CLI, risk pipeline, market data pipeline, проверки полноты данных, обработка ошибок и единый запуск. Основные файлы индивидуальной части: `backend/option_risk/api.py`, `backend/option_risk/cli.py`, `backend/option_risk/risk/pipeline.py`, `backend/option_risk/data/market_data_sessions.py`, `backend/option_risk/data/market_data_completeness.py`, `run_all.sh`.

== Состав испытаний

#h(2em) В индивидуальные испытания входят:

1. Проверка endpoint `/metrics` на валидном портфеле.
2. Проверка ошибки для мультивалютного портфеля без FX rates.
3. Проверка расчета с явными FX rates.
4. Проверка загрузки market data bundle.
5. Проверка отклонения поврежденного XLSX.
6. Проверка отклонения пустого XLSX.
7. Проверка отклонения XLSX с превышением лимита строк.
8. Проверка защиты от path traversal.
9. Проверка CLI demo с `--market-data-dir`.
10. Проверка запуска FastAPI и health endpoint.

== Методика испытаний

=== Backend unit и integration tests

#h(2em) Выполняется команда:

```bash
cd backend
PYTHONPATH=. pytest tests -q
```

#h(2em) Ожидаемый результат: тесты pricing, risk pipeline, API metrics, market data, calibration, completeness и security проходят без ошибок.

=== CLI demo

#h(2em) Выполняется расчет на примерах из `Datasets/examples` и market data из `Datasets/Данные для работы`:

```bash
cd backend
PYTHONPATH=. python -m option_risk.cli \
  --portfolio ../Datasets/examples/portfolio.csv \
  --scenarios ../Datasets/examples/scenarios.csv \
  --limits ../Datasets/examples/limits.json \
  --market-data-dir "../Datasets/Данные для работы" \
  --output /tmp/option_risk_output_demo
```

#h(2em) Ожидаемый результат: CLI выводит базовую стоимость портфеля, VaR, ES, LC VaR, Greeks и сохраняет отчеты.

=== API health

#h(2em) После запуска FastAPI выполняется:

```bash
curl -fsS http://127.0.0.1:8000/health
```

#h(2em) Ожидаемый результат: `{"status":"ok"}`.

=== Runtime audit сценарии

#h(2em) Для индивидуальной серверной части используются отчеты `backend_runtime_report.md`, `api_contract_report.md`, `regression_security_report.md`, `data_api_completeness_report.md`, `calculation_correctness_report.md`. Проверяются valid portfolio, invalid portfolio, large portfolio without FX, large portfolio with FX, corrupted XLSX, empty XLSX, row limit, API contracts и path traversal.

== Фактические результаты

#h(2em) Для текущей версии проекта backend-тесты прошли с результатом 72 passed, 10 skipped. Комплексный запуск `run_all.sh` завершился с кодом 0. Runtime reports содержат положительные результаты: backend runtime -- 13 PASS, API contract -- 16 PASS, regression security -- 14 PASS, data API completeness -- 39 PASS, calculation correctness -- 17 PASS.

== Критерии успешности

#h(2em) Индивидуальная часть считается прошедшей испытания, если серверная часть корректно рассчитывает валидный портфель, отклоняет невалидный портфель, не допускает расчета мультивалютного портфеля без FX-покрытия, корректно обрабатывает market data upload и возвращает структурированные ошибки для некорректных входных данных.

= СПИСОК ИСПОЛЬЗУЕМОЙ ЛИТЕРАТУРЫ

1. ГОСТ 19.301-79. Программа и методика испытаний. Требования к содержанию и оформлению.
2. ГОСТ 19.105-78. Единая система программной документации. Общие требования к программным документам.
