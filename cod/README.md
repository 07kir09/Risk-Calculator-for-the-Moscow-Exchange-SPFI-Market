# Риск-калькулятор опционов (портфель)

## Что реализовано
- Ценообразование: Black–Scholes (европейские), биномиальная CRR (европейские/американские), Монте‑Карло (европейские), поиск IV (Ньютон + бисекция).
- Греки: Delta/Gamma/Vega/Theta/Rho (аналитические BS) и численные разности.
- Риск: scenario-based VaR/ES (demo/simulated historical), параметрический VaR/ES (Normal и Cornish-Fisher, one-tail), LC VaR (денежный liquidity add-on), стресс‑сценарии с подсветкой превышений лимитов.
- Данные: загрузка CSV/JSON с жёсткой валидацией дат, валют ISO 4217, положительности цен/волатильности, ненулевых количеств; журнал ошибок.
- Отчёты: таблицы метрик/PNL/стрессов/лимитов, греки, позиции, журнал валидации; экспорт CSV/Excel/JSON + график распределения PnL.
- Детерминизм: все рандомизированные расчёты фиксируют seed по умолчанию.

## Структура
- `cod/option_risk/` — пакет (модели данных, ценообразование, греки, VaR/ES, стресс, отчёты, CLI).
- `cod/examples/` — образцы портфеля, сценариев, лимитов.
- `cod/tests/` — pytest‑тесты формул и граничных случаев.
- `cod/docs/` — трассируемость требований, план, примечания/допущения.
- `cod/frontend/` — React+TS UI: импорт/валидация, выбор метрик/сценариев, таблицы/графики, экспорт CSV/Excel/JSON; демо данные в `public/` и `src/mock`.
- `cod/option_risk/api.py` — FastAPI сервис для расчёта портфельных метрик (эндпойнт `/metrics`).

## Быстрый старт
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r cod/requirements.txt
PYTHONPATH=cod python -m option_risk.cli \
  --portfolio cod/examples/portfolio.csv \
  --scenarios cod/examples/scenarios.csv \
  --limits cod/examples/limits.json \
  --output cod/output
```
Результаты: `cod/output/csv/*.csv`, `cod/output/report.xlsx`, `cod/output/report.json`, график `cod/output/pnl_hist.png`. CLI принимает CSV/JSON портфеля и сценариев; лимиты — JSON.

### Фронтенд (React + TypeScript, Vite)
```bash
cd cod/frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # сборка
npm test           # Jest + React Testing Library
```
UI ведёт пользователя по шагам (wizard) строго по схеме:\
S1 импорт → S2 проверка → S3 рыночные данные → S4 настройки → S5 запуск → S6 панель → (стрессы/лимиты/маржа/экспорт/what‑if).\
По умолчанию фронт работает в demo‑режиме (без бэкенда). Чтобы переключиться на API: `VITE_DEMO_MODE=0` (при запущенном FastAPI).

Полезные страницы:
- `http://localhost:5173/ui-demo` — тест лейаутов (длинные тексты/таблицы) для проверки, что ничего не «наезжает».
- `http://localhost:5173/portfolio` — просмотр текущего загруженного портфеля.

UX‑фишки:
- onboarding‑подсказка (показывается один раз) + «Что дальше» на каждом шаге;
- импорт CSV через drag&drop;
- переключатель светлой/тёмной темы в верхней панели;
- «заблокированные» шаги в меню не “молчат”: кликом переводят на нужный шаг и показывают причину.

E2E (Playwright):
```bash
cd cod/frontend
npm run e2e:install
npm run e2e
```

### Запуск всем проектом одной командой (macOS)
```bash
bash cod/run_all.sh
```
Скрипт создаёт `.venv`, ставит зависимости, гоняет pytest, запускает CLI с примерами в `cod/output_demo`, поднимает FastAPI на `:8000` и Vite UI на `:5173` (логи: `/tmp/option_risk_api.log`, `/tmp/option_risk_vite.log`).

### Формат входных файлов
- Портфель (CSV/JSON, обязательные поля):
  - `instrument_type` (`option`/`forward`/`swap_ir`), `position_id`, `quantity` (знак = направление), `notional` (для форварда/свопа),
  - `option_type`, `style` (для опционов), `underlying_symbol`, `currency` (ISO 4217), `underlying_price`, `strike` (форвардная цена / фикс по свопу), `volatility`,
  - `maturity_date`, `valuation_date` (ISO 8601, maturity > valuation), `risk_free_rate`,
  - опционально: `dividend_yield`, `liquidity_haircut`, `model`, `fixed_rate`/`float_rate`/`day_count` (для свопа).
- Сценарии (CSV/JSON): `scenario_id`, `underlying_shift` (например, -0.05), `volatility_shift`, `rate_shift`, опционально `probability`.
  - `rate_shift` трактуется как абсолютный сдвиг ставки (в долях).
  - После шока волатильность ограничивается снизу (`max(vol, eps)`), чтобы избежать отрицательных значений.
  - `probability` используется для weighted historical VaR/ES; если задана хотя бы в одном сценарии, должна быть задана во всех сценариях (далее нормализуется на сумму).
- Лимиты (JSON): ключи метрик (`var_hist`, `es_hist`, `var_param`, `es_param`, `lc_var`), вложенный объект `stress` со значениями по `scenario_id`.

### CLI-опции
- `--portfolio PATH` — входной портфель.
- `--scenarios PATH` — сценарии; если не заданы — встроенные шоки ±2/5/10%.
- `--limits PATH` — лимиты в JSON.
- `--output PATH` — каталог выгрузок (создаётся автоматически).
- `--parametric-tail-model normal|cornish_fisher` — tail-модель для параметрического VaR/ES.

## Тесты
```bash
PYTHONPATH=cod pytest cod/tests -q
```
Включены golden-тесты в `cod/tests/golden/*.json` (фиксированные входы/ожидания для VaR/ES/LC/FX).

## Допущения и правки наблюдателя
- Hazard rate исключён из расчётов и описаний (требование 4.1.1 remove_hazard_rate).
- Источник данных нейтрален: файлы/ручной ввод/выгрузки, без обещаний интеграции с ISS (4.1.2 rephrase_no_iss).
- KPI «до 1000 записей ≤5с» не заявлен как обязательный (4.1.4 remove_unfeasible).
- В demo режиме “historical” VaR/ES считаются по пользовательским сценариям (simulated), а не по рыночному time-series.
- Historical VaR использует дискретную конвенцию `k = ceil(N*(1-CL))` без интерполяции.
- Historical VaR/ES поддерживают weighted режим по вероятностям сценариев (`probability`) с нормализацией весов.
- Параметрический VaR/ES поддерживает `normal` и `cornish_fisher` (`parametric_tail_model`).
- LC VaR считается как `VaR + liquidity add-on` в деньгах базовой валюты.
  Поддержаны модели add-on: `fraction_of_position_value`, `half_spread_fraction`, `absolute_per_contract`.
- Добавлена минимальная мультивалютная агрегация: `base_currency` + `fx_rates` (stub), с предупреждением при неполном FX-покрытии.
- Образовательная направленность уточнена как внутренняя/внутри программы в плане (см. `cod/docs/plan.md`).
- Все вычисления без округлений; форматирование только на уровне вывода.

## Следующие шаги
- При необходимости подключить реальные ряды цен/волатильности и сценарии — добавить загрузчики в `option_risk/data`.
- Для расширения отчётности добавить дополнительные графики/форматы в `option_risk/reporting`.
