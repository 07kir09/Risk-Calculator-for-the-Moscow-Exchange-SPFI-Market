# Backend

`backend/` содержит Python-часть проекта:
- `option_risk/` — расчётный пакет и FastAPI API;
- `tests/` — pytest и golden cases;
- `requirements.txt` — зависимости;
- `output/`, `output_demo/` — локальные выгрузки CLI.

Быстрый старт:
```bash
cd backend
PYTHONPATH=. pytest tests -q
PYTHONPATH=. uvicorn option_risk.api:app --reload
```

Live market data (CBR + MOEX):
```bash
cd backend
PYTHONPATH=. python3 scripts/sync_live_market_data.py --lookback-days 180
```

После синка используйте `session_id` в `/metrics.market_data_session_id`.

Автоматический режим для `/metrics` без ручной загрузки:
- `OPTION_RISK_USE_LATEST_MARKET_DATA=1` (по умолчанию): взять последний ready session, если есть.
- `OPTION_RISK_AUTO_MARKET_DATA=1`: если ready session нет, создать новый live session на лету.
- `OPTION_RISK_AUTO_MARKET_LOOKBACK_DAYS=180`: окно истории для live синка.

Новый endpoint:
- `POST /market-data/sync-live` c body `{ "as_of_date": "YYYY-MM-DD", "lookback_days": 180 }`
- `GET /market-data/health?max_age_days=1` проверка свежести последнего ready bundle.

Проверка свежести из CLI:
```bash
cd backend
PYTHONPATH=. python3 scripts/check_market_data_health.py --max-age-days 1
```

Готовые шаблоны автозапуска:
- `deploy/systemd/option-risk-market-sync.service`
- `deploy/systemd/option-risk-market-sync.timer`
- `deploy/cron/option-risk-market-sync.cron`
