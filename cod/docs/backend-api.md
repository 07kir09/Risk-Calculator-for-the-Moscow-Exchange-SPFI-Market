# Backend API (Option Risk) — Guide for Frontend

Этот документ описывает текущий backend этого проекта так, чтобы фронтенд-разработчик мог
подключить UI, не читая код бэка. Источник истины: запущенный FastAPI и `openapi.json`
в корне репозитория.

## 1) Что делает backend в двух словах

Backend принимает:
- портфель позиций (опционы / форварды / процентные свопы),
- набор рыночных сценариев (сдвиги цены, волатильности, ставки),
- конфиг расчёта (confidence level, горизонт, ликвидность, FX и какие блоки считать),

и возвращает одним ответом набор метрик риска:
- оценку стоимости портфеля,
- VaR / ES (historical и parametric),
- LC VaR (VaR + ликвидностная надбавка),
- стресс‑результаты по сценариям,
- чувствительности (греки),
- корреляции PnL по позициям,
- распределение PnL по сценариям,
- топ‑контрибьюторы риска,
- журнал валидации/предупреждений.

Важно: **“historical” VaR/ES здесь считается по пользовательским сценариям**, а не по историческому временному ряду рынка.

## 2) Как запустить

Локально (как в `run_all.sh`):
```bash
PYTHONPATH="." uvicorn option_risk.api:app --host 0.0.0.0 --port 8000
```

Проверка:
```bash
curl -s http://127.0.0.1:8000/health
```

Swagger/OpenAPI:
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/openapi.json`

## 3) Базовые URL и прокси фронта

По умолчанию API слушает `http://127.0.0.1:8000`.

Если фронт на Vite настроен с прокси `/api -> http://127.0.0.1:8000` (как у нас),
то во фронте удобно дергать:
- `GET /api/health` (прокси на `GET /health`)
- `POST /api/metrics` (прокси на `POST /metrics`)

В проде нужен либо reverse proxy (чтобы фронт и бек были на одном origin),
либо CORS на бэке (в текущей версии CORS middleware не подключен).

## 4) Общие особенности ответа

### Заголовки для трассировки

Каждый ответ (успех и ошибки) получает заголовки:
- `x-request-id` — request id (если клиент прислал `x-request-id`, сервер его сохранит; иначе сгенерирует)
- `x-trace-id` — trace id (всегда генерируется)

Это полезно для логов/дебага: храните и показывайте их в UI при ошибках.

### JSON-safe числа

Backend прогоняет ответ через “json safe”:
- `NaN`, `+Inf`, `-Inf` в числах заменяются на `0.0`.

### Ошибки: единый формат

#### 422 Validation Error (ошибка формы запроса)
Возвращается, когда FastAPI/Pydantic не смог распарсить/валидировать body.

Формат:
```json
{
  "code": "validation_error",
  "message": "Ошибка валидации запроса",
  "details": [ /* массив ошибок Pydantic */ ],
  "requestId": "…",
  "traceId": "…"
}
```

#### 400 HTTP Error (логическая/бизнес ошибка в расчетах)
Возвращается, когда расчет выбрасывает `ValueError` (например, неизвестная модель хвоста,
некорректные weights сценариев, неизвестная liquidity модель и т.п.).

Формат:
```json
{
  "code": "http_error",
  "message": "…",
  "requestId": "…",
  "traceId": "…"
}
```

#### 500 Internal Error (необработанная ошибка)
Формат:
```json
{
  "code": "internal_error",
  "message": "Внутренняя ошибка сервера при расчёте",
  "details": "…",
  "requestId": "…",
  "traceId": "…"
}
```

Рекомендация для фронта: в UI показывать `message`, а `details` — только в “advanced/debug” режиме.

## 5) Эндпоинты

В API всего 4 endpoint:
- `GET /health`
- `GET /limits`
- `GET /scenarios`
- `POST /metrics`

Ниже подробно.

### 5.1) GET /health

Назначение: “жив ли сервис”.

Ответ:
```json
{ "status": "ok" }
```

### 5.2) GET /limits

Назначение: получить дефолтные лимиты из файла `examples/limits.json`.

Ответ: JSON-объект (может быть пустым `{}`, если файл не найден).

Пример:
```json
{
  "var_hist": 5000,
  "es_hist": 7000,
  "var_param": 5000,
  "es_param": 7000,
  "lc_var": 8000,
  "stress": {
    "shock_down": 9000,
    "shock_up": 9000
  }
}
```

Семантика лимитов:
- Для риск‑мер (VaR/ES/LC VaR): breach если `metric_value > abs(limit)`.
- Для стресс PnL: breach если `scenario_pnl < -abs(limit)`.

Где используются:
- Можно передать эти лимиты в `POST /metrics` (поле `limits`) и получить результат проверки лимитов в ответе (`limits`).
- Блок `stress` используется для лимитов по конкретным сценариям (см. `stress` в ответе).

### 5.3) GET /scenarios

Назначение: получить дефолтные сценарии из `examples/scenarios.csv`.

Ответ: массив сценариев.

Пример (как в CSV):
```json
[
  { "scenario_id": "mild_down", "underlying_shift": -0.02, "volatility_shift": 0.01, "rate_shift": 0.0 },
  { "scenario_id": "base", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0 },
  { "scenario_id": "mild_up", "underlying_shift": 0.02, "volatility_shift": -0.01, "rate_shift": 0.0 },
  { "scenario_id": "shock_down", "underlying_shift": -0.1, "volatility_shift": 0.05, "rate_shift": -0.005 },
  { "scenario_id": "shock_up", "underlying_shift": 0.1, "volatility_shift": -0.05, "rate_shift": 0.005 }
]
```

Семантика полей сценария:
- `underlying_shift`: относительный сдвиг цены (0.05 = +5%).
- `volatility_shift`: относительный сдвиг волатильности (0.1 = +10%).
- `rate_shift`: абсолютный сдвиг ставки (0.01 = +1%).

### 5.4) POST /metrics (главная точка интеграции)

Назначение: расчет всех метрик одним вызовом.

Вход: JSON (см. `PortfolioRequest`).
Выход: большой JSON (см. `CalculationResult`).

## 6) Модели данных (что шлет фронт)

### 6.1) PortfolioRequest

```ts
type PortfolioRequest = {
  positions: OptionPosition[];       // обязательно, может быть много
  scenarios: MarketScenario[];       // обязательно (может быть [] если хотите только base_value/greeks)
  limits?: Record<string, any> | null;

  alpha?: number;                   // default 0.99
  horizon_days?: number;            // default 1
  parametric_tail_model?: "normal" | "cornish_fisher"; // default "normal"

  base_currency?: string;           // default "RUB"
  fx_rates?: Record<string, number> | null;

  liquidity_model?: "fraction_of_position_value" | "half_spread_fraction" | "absolute_per_contract";
  mode?: "demo" | "api" | string;   // влияет в основном на methodology_note

  calc_sensitivities?: boolean;     // default true
  calc_var_es?: boolean;            // default true
  calc_stress?: boolean;            // default true
  calc_margin_capital?: boolean;    // default true
  calc_correlations?: boolean;      // default true
};
```

Критично:
- Если `limits` отсутствует или `{}`, то `result.limits` в ответе будет `null`.
- Если `scenarios` пустой, то VaR/ES/Stress/Correlations не считаются (получите `null` в соответствующих полях).

### 6.2) OptionPosition (позиция)

Поддерживаемые типы инструментов:
- `option` — опционы (европ/амер)
- `forward` — форварды (PV = (S0-K)*notional*exp(-rT))
- `swap_ir` — упрощённый процентный своп

```ts
type OptionPosition = {
  instrument_type?: "option" | "forward" | "swap_ir"; // default "option"
  position_id: string;                                // required, уникальный id

  option_type?: "call" | "put";                       // default "call"
  style?: "european" | "american";                    // default "european"

  quantity: number;                                   // required, != 0 (знак = направление)
  notional?: number;                                  // default 1.0, >= 0

  underlying_symbol: string;                          // required
  underlying_price: number;                           // required, > 0
  strike: number;                                     // required, > 0

  volatility?: number;                                // options: > 0; forward/swap: >= 0

  maturity_date: string;                              // required, "YYYY-MM-DD", > valuation_date
  valuation_date: string;                             // required, "YYYY-MM-DD"

  risk_free_rate: number;                             // required, decimal (0.05=5%), >= -1.0
  dividend_yield?: number;                            // default 0.0, >= 0

  currency?: string;                                  // default "RUB", ISO 4217
  liquidity_haircut?: number;                         // default 0.0, >= 0

  model?: string | null;                              // option model hint: "binomial"|"mc"|any(other)=BS

  // только для swap_ir
  fixed_rate?: number | null;
  float_rate?: number | null;
  day_count?: number | null;
};
```

Как backend трактует поля для разных инструментов:
- `option`:
  - `model == "binomial"` => биномиальная модель.
  - `model == "mc"` => Monte‑Carlo.
  - иначе => Black‑Scholes (или intrinsic, если цена “неадекватна”).
  - `style == "american"` => всегда binomial.
- `forward`:
  - `underlying_price` = S0, `strike` = K, `notional` = мультипликатор.
- `swap_ir`:
  - `fixed_rate` если задан, иначе берется из `strike`.
  - `float_rate` если задан, иначе берется из `risk_free_rate`.
  - `day_count` если задан, иначе берется время до погашения.
  - `underlying_price` формально обязателен в модели данных, но в расчете свопа не используется.

Валидация (важно для UI):
- `quantity` не может быть 0.
- `underlying_price` и `strike` должны быть > 0.
- Для `instrument_type=option` волатильность должна быть строго > 0.
- `maturity_date` должна быть позже `valuation_date`.
- `currency` — ровно 3 буквы.

### 6.3) MarketScenario (рыночный сценарий)

```ts
type MarketScenario = {
  scenario_id: string;            // required
  underlying_shift?: number;      // default 0.0 (relative)
  volatility_shift?: number;      // default 0.0 (relative)
  rate_shift?: number;            // default 0.0 (absolute)
  probability?: number | null;    // optional
};
```

Правило `probability`:
- Если `probability` задана хотя бы у одного сценария, она должна быть задана у всех.
- Вероятности нормализуются на сумму (если сумма != 1, в `validation_log` появится INFO сообщение).
- Эти веса используются только для **historical VaR/ES**.

Как сценарий применяется к позиции:
- `underlying_price = underlying_price * (1 + underlying_shift)`
- `volatility = volatility * (1 + volatility_shift)` и для опционов есть floor `1e-8`
- `risk_free_rate = risk_free_rate + rate_shift`

## 7) Ответ POST /metrics (что получает фронт)

Backend возвращает JSON, который соответствует `CalculationResult` (dataclass).

```ts
type ValidationMessage = {
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  row?: number | null;
  field?: string | null;
};

type StressResult = {
  scenario_id: string;
  pnl: number;             // PnL по сценарию в base_currency
  limit: number | null;    // лимит из limits.stress[scenario_id], если задан
  breached: boolean;
};

type TopContributorRow = {
  metric: "var_hist" | "es_hist" | "stress";
  position_id: string;
  pnl_contribution: number;        // вклад позиции в PnL выбранного сценария/хвоста
  abs_pnl_contribution: number;    // abs(pnl_contribution) для сортировки
  scenario_id?: string;            // для var/stress — id сценария; для es_hist — "tail_mean"
};

type MetricsResponse = {
  // Стоимость портфеля
  base_value: number;               // суммарная PV в base_currency

  // VaR / ES
  var_hist: number | null;
  es_hist: number | null;
  var_param: number | null;
  es_param: number | null;

  // Liquidity-adjusted VaR
  lc_var: number | null;            // var_hist + liquidity add-on
  lc_var_addon: number | null;
  lc_var_breakdown: Array<{
    position_id: string;
    model: string;
    quantity: number;
    position_value: number;         // PV позиции в base_currency
    haircut_input: number;
    add_on_money: number;
  }> | null;

  // Greeks / sensitivities
  greeks: Record<string, number> | null; // delta,gamma,vega,theta,rho,dv01

  // Stress
  stress: StressResult[] | null;

  // Топ вкладов в хвост/стресс
  top_contributors: {
    var_hist: TopContributorRow[];
    es_hist: TopContributorRow[];
    stress: TopContributorRow[];
  } | null;

  // Результат проверки лимитов (только если limits передан НЕ пустой)
  // Важно: это список массивов (из-за tuple в Python), а не объектов.
  limits: Array<[string, number, number, boolean]> | null;

  // Корреляции (NxN) по позициям
  correlations: number[][] | null;

  // Матрица PnL (positions x scenarios), может отсутствовать если слишком большая
  pnl_matrix: number[][] | null;

  // Распределение PnL по сценариям (в том же порядке, что и scenarios во входе)
  pnl_distribution: number[] | null;

  // Агрегации (сейчас по умолчанию "currency")
  buckets: Record<string, Record<string, number>> | null;

  // Эхо-конфиг и заметки
  base_currency: string;
  confidence_level: number;
  horizon_days: number;
  parametric_tail_model: string;
  mode: string;
  liquidity_model: string;

  methodology_note: string | null;  // чаще всего есть в demo mode
  fx_warning: string | null;        // если не хватило fx_rates при мультивалютном портфеле

  // Капитал/маржа
  capital: number | null;           // max(var_hist, es_hist) если считалось
  initial_margin: number | null;    // == lc_var
  variation_margin: number | null;  // pnl последнего сценария в списке (см. ниже)

  validation_log: ValidationMessage[];
};
```

### Важные детали семантики полей

1) `base_value`
- Это PV портфеля в `base_currency`.
- Если в портфеле валюты разные, применяется FX конверсия (`fx_rates`).

2) `pnl_distribution`
- Это массив PnL по каждому сценарию **в порядке входного массива `scenarios`**.
- PnL считается как `PV(stressed) - PV(base)` (в base currency).

3) `var_hist` / `es_hist`
- Вычисляются по `pnl_distribution`.
- Возвращаются как **положительные числа “loss”** (`max(0, -quantilePnL)`).
- Historical VaR использует дискретный квантиль (Excel‑like, без интерполяции).
- Если в сценариях заданы `probability`, то используется взвешенный квантиль/ES.

4) `var_param` / `es_param`
- Параметрическая оценка по mean/std из `pnl_distribution`.
- Масштабируется на `horizon_days`:
  - mean * horizon
  - std * sqrt(horizon)
- `parametric_tail_model`:
  - `normal` — стандартный Normal quantile.
  - `cornish_fisher` — усиленный хвост на основе skew/kurtosis losses.

5) `lc_var_addon`, `lc_var_breakdown`, `lc_var`
- Add-on зависит от `liquidity_model` и `liquidity_haircut` в каждой позиции.
- `lc_var = var_hist + max(0, lc_var_addon)`.
- `lc_var_breakdown` может быть укорочен (top-N по add-on) и тогда появится WARNING в `validation_log`.

6) `correlations`
- Корреляция считается по PnL матрице позиций (позиции x сценарии).
- Если сценарии вырождены (нулевая дисперсия) и получаются NaN/Inf, backend стабилизирует матрицу:
  - диагональ = 1
  - прочие элементы = 0
  - + WARNING в `validation_log`
- Если позиций слишком много (>2000), корреляции пропускаются и в `validation_log` будет WARNING.

7) `pnl_matrix`
- Чтобы не отдавать гигабайты, backend может выкинуть `pnl_matrix`, если она слишком большая
  (по умолчанию лимит 100_000 ячеек).
- В этом случае `pnl_distribution` всё равно будет.

8) `variation_margin`
- Сейчас это просто `pnl` **последнего** сценария из `pnl_distribution`.
- Это значит: если вы хотите “variation margin = base scenario pnl”, ставьте base‑сценарий последним в `scenarios`.

9) `limits`
- Возвращается только если `limits` во входе был НЕ пустой.
- Формат: список `[metric_name, value, limit, breached]`.

10) `validation_log`
- Используйте для UI‑алертов/баннеров. Там бывают:
  - предупреждения по FX (не передали курс для валюты),
  - предупреждения по корреляциям (NaN стабилизирован),
  - предупреждения о пропуске `pnl_matrix`,
  - INFO о нормализации probabilities.

## 8) Минимальный рабочий пример запроса

```json
{
  "positions": [
    {
      "instrument_type": "forward",
      "position_id": "fwd_rub_1",
      "quantity": 1,
      "notional": 1,
      "underlying_symbol": "RUBUND",
      "underlying_price": 100,
      "strike": 90,
      "volatility": 0,
      "maturity_date": "2026-01-01",
      "valuation_date": "2025-01-01",
      "risk_free_rate": 0,
      "dividend_yield": 0,
      "currency": "RUB",
      "liquidity_haircut": 0.1
    }
  ],
  "scenarios": [
    { "scenario_id": "down10", "underlying_shift": -0.1, "volatility_shift": 0, "rate_shift": 0 },
    { "scenario_id": "base", "underlying_shift": 0, "volatility_shift": 0, "rate_shift": 0 },
    { "scenario_id": "up10", "underlying_shift": 0.1, "volatility_shift": 0, "rate_shift": 0 }
  ],
  "alpha": 0.95,
  "horizon_days": 1,
  "base_currency": "RUB",
  "fx_rates": {},
  "liquidity_model": "fraction_of_position_value",
  "mode": "api",
  "calc_sensitivities": true,
  "calc_var_es": true,
  "calc_stress": true,
  "calc_margin_capital": true,
  "calc_correlations": true
}
```

Ожидаемое (по золотому тест-кейсу) поведение:
- `base_value = 10.0`
- `var_hist = 10.0`
- `lc_var_addon = 1.0` (10% от base_value)
- `lc_var = 11.0`

## 9) Практические рекомендации для фронта

1) Разделите UI на 3 шага:
- Редактор портфеля (positions).
- Редактор сценариев (scenarios).
- Конфиг расчёта + кнопка “Calculate” (POST /metrics).

2) Всегда показывайте пользователю:
- `base_currency`, `confidence_level`, `horizon_days`.
- `methodology_note` (если пришла).
- `validation_log` (особенно WARNING).

3) Обработка ошибок:
- 422: подсветить поля/строки (у ошибок есть структура `details`).
- 400/500: показать `message` + requestId/traceId.

4) Корреляции/матрицы:
- `correlations` и `pnl_matrix` могут быть `null` — UI должен деградировать корректно.

5) Мультивалюта:
- Если в портфеле есть, например, `USD`, а `base_currency = RUB`, передайте `fx_rates: { "USD": 90 }`,
  иначе backend посчитает FX как 1.0 и добавит предупреждение в `validation_log`.

