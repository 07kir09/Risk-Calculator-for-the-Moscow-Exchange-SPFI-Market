= ОПИСАНИЕ ЯЗЫКА

== Назначение документа

#h(2em) В проекте не используется отдельный предметно-ориентированный язык программирования, однако используются фиксированные форматы входных данных и API payload. Настоящий документ описывает эти форматы как "язык" обмена данными между оператором, frontend и backend.

== Формат портфеля

#h(2em) Портфель может передаваться в CSV, JSON, XLS или XLSX. В backend каждая строка нормализуется в модель `OptionPosition`. Основные поля:

- `instrument_type` -- тип инструмента: `option`, `forward`, `swap_ir`;
- `position_id` -- идентификатор позиции;
- `option_type` -- `call` или `put`;
- `style` -- `european` или `american`;
- `quantity` -- количество контрактов, знак задает направление;
- `notional` -- номинал или мультипликатор;
- `underlying_symbol` -- код базового актива;
- `underlying_price` -- цена базового актива;
- `strike` -- strike, forward price или fixed rate;
- `volatility` -- годовая волатильность;
- `maturity_date` -- дата погашения или экспирации;
- `valuation_date` -- дата оценки;
- `risk_free_rate` -- безрисковая ставка;
- `dividend_yield` -- дивидендная доходность;
- `currency` -- валюта ISO 4217;
- `liquidity_haircut` -- параметр ликвидностной надбавки;
- `model` -- предпочтительная модель оценки: `black_scholes`, `binomial`, `mc`.

#h(2em) Для свопов дополнительно используются поля fixed/float rates, day count, curve refs, payment lag, leg settings, calendars, spreads, currencies of legs и flags exchange principal.

== Формат сценариев

#h(2em) Сценарий соответствует модели `MarketScenario`. Основные поля:

- `scenario_id` -- идентификатор сценария;
- `underlying_shift` -- относительный сдвиг базового актива;
- `volatility_shift` -- абсолютный сдвиг волатильности;
- `rate_shift` -- абсолютный сдвиг ставки;
- `probability` -- вероятность сценария;
- `curve_shifts` -- сдвиги отдельных кривых;
- `fx_spot_shifts` -- сдвиги FX spot.

#h(2em) Если вероятность указана, historical VaR/ES могут рассчитываться как weighted-оценки по левому хвосту.

== Формат лимитов

#h(2em) Лимиты передаются в JSON. Поддерживаются лимиты по основным метрикам риска (`var_hist`, `es_hist`, `var_param`, `es_param`, `lc_var`) и лимиты по стресс-сценариям. Backend проверяет, что значения лимитов являются положительными конечными числами.

== Формат market data bundle

#h(2em) Market data bundle передается как набор XLSX-файлов:

- `curveDiscount.xlsx` -- discount curves;
- `curveForward.xlsx` -- forward/projection curves;
- `fixing.xlsx` -- historical/latest fixings;
- `calibrationInstrument*.xlsx` -- OIS, IRS, FRA, FX swap, basis и XCCY calibration instruments;
- `RC_*.xlsx` -- FX history.

#h(2em) Backend распознает currency code и curve names, строит `MarketDataContext`, калибрует кривые и проверяет полноту данных для расчета. Для production-style расчета неполный market data bundle блокируется.

== Формат API payload

#h(2em) Frontend отправляет расчет через `POST /metrics`. Payload содержит:

- `positions` -- массив нормализованных позиций;
- `scenarios` -- массив сценариев;
- `limits` -- лимиты;
- `alpha` -- уровень доверия;
- `horizon_days` -- горизонт риска;
- `parametric_tail_model` -- `normal` или `cornish_fisher`;
- `base_currency` -- базовая валюта;
- `fx_rates` -- словарь FX-курсов;
- `liquidity_model` -- модель ликвидностной надбавки;
- `calc_sensitivities`, `calc_var_es`, `calc_stress`, `calc_margin_capital` -- flags расчета;
- `market_data_session_id` -- идентификатор market data session;
- `auto_market_data` -- разрешение автоматической загрузки bundled market data.

#h(2em) Ответ `MetricsResponse` содержит результаты расчета, validation log, data quality, stress rows, LC VaR breakdown, contributors, PnL distribution и служебные поля методологии.
