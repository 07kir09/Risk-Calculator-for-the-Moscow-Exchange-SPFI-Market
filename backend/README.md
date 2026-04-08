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
