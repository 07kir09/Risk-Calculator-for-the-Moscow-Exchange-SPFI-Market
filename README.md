# Risk Calculator for MOEX SPFI (Риск-калькулятор СПФИ)

Веб-платформа для загрузки данных (MOEX ISS API / CSV), расчёта и анализа риск-метрик по инструментам и портфелям рынка стандартизированных производных финансовых инструментов (СПФИ) Московской Биржи, с визуализацией и экспортом результатов.

Проект разрабатывается как учебный (курсовой) и ориентирован на:
- импорт и валидацию исходных данных,
- расчёт ключевых риск-метрик (VaR, ES, Greeks/DV01 и др.),
- библиотеку стресс-сценариев и стресс-P&L,
- веб-интерфейс с фильтрами, графиками и экспортом (CSV/Excel),
- REST API (JSON) для интеграции фронта и бэкенда.

> Требования, стек и перечень функций описаны в ТЗ: `docs/tz.pdf`.

---

## Стек

- **Backend:** Python 3.12+, FastAPI, pytest
- **Frontend:** React + TypeScript (Vite), Jest/тесты по мере необходимости
- **DB/Cache:** PostgreSQL, Redis
- **Визуализация:** Plotly / ECharts
- **Экспорт:** CSV/Excel (SheetJS на фронте)
- **Dev:** Docker Compose, GitHub Actions (CI)

---

## Структура репозитория

- `backend/` — API и расчётные модули (FastAPI)
- `frontend/` — UI (React/TS)
- `docs/` — документация, ТЗ, архитектура, OpenAPI контракт
- `infra/` — docker/compose/nginx и прочая инфраструктура
- `.github/` — CI, шаблоны PR, CODEOWNERS

---

## Быстрый старт (локально через Docker)

### 1) Подготовка env
Скопируйте переменные окружения:
- `cp .env.example .env`
- `cp backend/.env.example backend/.env`
- `cp frontend/.env.example frontend/.env`

### 2) Запуск
Из корня:
```bash
docker compose -f infra/compose.yml up --build
