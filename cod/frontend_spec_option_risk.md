# Frontend specification for Option Risk UI

## 1. Цель документа

Этот документ описывает, **что именно должен делать интерфейс**, как он должен быть устроен визуально, какие экраны нужны, какие компоненты нужны, как собираются данные, как запускается расчет, как отображается результат, как обрабатываются ошибки, и как сохранить стиль того dark-fintech дизайна, который уже выбран.

Документ написан так, чтобы фронтенд-разработчик мог собрать интерфейс целиком: от каркаса приложения и роутинга до таблиц, графиков, форм, валидации, загрузки CSV и отображения риск-метрик.

Ключевое ограничение: **визуальный стиль менять сильно нельзя**. Основа остается такой же:
- темный premium analytics UI;
- холодные синие акценты;
- левая вертикальная навигация;
- компактный верхний бар;
- карточки с мягкими границами;
- светлые таблицы внутри темного интерфейса;
- графики и матрицы как в референсе.

При этом нужно раскрыть **полный функционал расчетного сервиса**, даже если часть функций не видна на референсе напрямую. Делается это не через радикальную смену дизайна, а через:
- вкладки;
- drawer / side panels;
- modal для добавления и редактирования;
- expand-секции;
- дополнительные таблицы и блоки внутри уже существующей визуальной системы.

---

## 2. Что такое готовый продукт на фронте

Пользователь должен получить веб-приложение, в котором можно:

1. Проверить, что расчетный сервис доступен.
2. Создать или загрузить портфель позиций.
3. Отредактировать позиции вручную.
4. Создать или подгрузить рыночные сценарии.
5. Подгрузить дефолтные лимиты.
6. Настроить параметры расчета.
7. Запустить расчет одной кнопкой.
8. Посмотреть результат в нескольких аналитических представлениях:
   - Summary / overview;
   - Portfolio Builder;
   - Portfolio Risk;
   - Scenario Risk;
   - Stress Testing;
   - Data Upload / mapping / import review.
9. Просмотреть предупреждения и сообщения валидации.
10. Разобрать ошибки формы и системные ошибки.
11. Понять, какие значения нарушают лимиты.
12. Посмотреть корреляции, распределение PnL, топ-контрибьюторов, stress results, liquidity add-on и Greeks.

Приложение должно быть рассчитано на два режима работы:
- **ручная сборка** портфеля и сценариев;
- **загрузка CSV** с последующим маппингом колонок и ревью.

---

## 3. Информационная архитектура

Нужны следующие основные разделы в левой навигации:

1. **Dashboard**
2. **Portfolio Builder**
3. **Data Upload**
4. **Portfolio Risk**
5. **Scenario Risk**
6. **Stress Testing**
7. **Settings** или **Run Config**

Если хочется максимально сохранить референс, то визуально в sidebar оставляем 5-6 пунктов, а раздел Settings можно не выносить отдельным пунктом, а открыть как правый drawer из header.

### Рекомендуемый роутинг

```text
/
/dashboard
/portfolio-builder
/data-upload
/portfolio-risk
/scenario-risk
/stress-testing
```

Дополнительно допускаются вложенные состояния через query params:

```text
/portfolio-builder?tab=positions
/portfolio-builder?tab=scenarios
/portfolio-builder?tab=limits
/portfolio-risk?tab=summary
/portfolio-risk?tab=greeks
/portfolio-risk?tab=contributors
/stress-testing?scenario=shock_down
```

### Что хранится глобально

Глобальное состояние приложения должно содержать:

- текущий портфель `positionsDraft`;
- текущие сценарии `scenariosDraft`;
- текущие лимиты `limitsDraft`;
- настройки расчета `runConfigDraft`;
- результат последнего расчета `calculationResult`;
- статус запросов;
- последнюю ошибку;
- `requestId` и `traceId` последнего ответа;
- флаги dirty / pristine для черновиков;
- статус connected / disconnected для health check.

---

## 4. Визуальная система

### 4.1 Общий стиль

Стиль интерфейса должен остаться близким к референсу:

- dark finance / analytics;
- мягкий depth effect;
- thin borders;
- спокойные, не кислотные акценты;
- чистая типографика;
- высокий контраст только там, где важны числа и ключевые результаты.

Нельзя превращать это в:
- яркую SaaS CRM;
- glassmorphism ради glassmorphism;
- неоновый cyberpunk;
- слишком блочный Bootstrap-like интерфейс.

### 4.2 Цвета

Рекомендуемая палитра:

```text
Background main:       #0A1020
Background panel:      #141C2F
Background card:       #182238
Background input:      #1A2234
Border default:        rgba(255,255,255,0.08)
Border strong:         rgba(255,255,255,0.14)
Text primary:          #F2F5FB
Text secondary:        #A9B2C2
Text muted:            #7F8998
Blue accent:           #63B6FF
Blue bright:           #4EA6FF
Cyan accent:           #6DD2FF
Green positive:        #67D58C
Red negative:          #E86A63
Orange warning:        #F0A867
White card bg:         #F4F6F8
White table bg:        #F7F8FA
Dark text on light:    #202A38
```

### 4.3 Тени и глубина

Каждый panel/card:
- border 1px;
- radius 12px;
- outer shadow мягкий;
- легкий внутренний свет сверху.

Пример:

```css
box-shadow:
  0 12px 32px rgba(0,0,0,0.28),
  inset 0 1px 0 rgba(255,255,255,0.03);
```

### 4.4 Типографика

Шрифт: `Inter`.

Иерархия:
- Page title: 18-20 px, 600
- Panel title: 13-14 px, 600
- Body: 12 px, 400/500
- Label: 11 px, 500
- Axis / helper text: 10 px, 400
- KPI value: 20-24 px, 600

### 4.5 Grid

Desktop-first layout:
- sidebar 208 px;
- topbar 56 px;
- main content padding 20-24 px;
- gaps 16 px;
- cards 12 px radius;
- compact controls 32-36 px height;
- primary buttons 36-40 px height.

Минимальная рабочая ширина: `1280px`.

Адаптивность нужна, но не mobile-first. При ширине меньше 1180 px можно:
- превращать часть grid в 1 колонку;
- переносить правые narrow-panels вниз;
- сворачивать sidebar в icon-only.

---

## 5. Что нельзя менять визуально

Ниже список визуальных инвариантов. Их надо сохранить.

1. Левый sidebar остается темным и компактным.
2. Header остается тонким, не превращается в жирную шапку.
3. KPI-карточки на summary-экранах могут быть светлыми, как в референсе.
4. Таблицы могут быть светлыми внутри темного интерфейса.
5. Графики должны быть гладкими, не перегруженными.
6. Heatmap / correlation matrix должна оставаться квадратной матрицей с красно-синими ячейками.
7. Кнопок немного, и они не должны доминировать над аналитикой.
8. Никаких толстых разделителей, тяжелых бордеров и жирных backgrounds.

---

## 6. Что можно менять без потери референса

Можно и нужно аккуратно добавить:

- Tabs внутри экранов;
- drawer для расширенных настроек;
- modal для редактирования позиции или сценария;
- collapsible секции;
- toast и alert banners;
- detail panel для ошибок и validation log;
- пустые состояния и skeleton loaders.

То есть структура расширяется, но дизайн-система остается той же.

---

## 7. Технологический стек фронта

Рекомендуемый стек:

- **React + TypeScript**
- **Vite**
- **TanStack Query** для запросов и кэширования
- **Zustand** или Redux Toolkit для глобального draft state
- **React Hook Form** + **Zod** для форм
- **AG Grid** или качественная headless table-обвязка для таблиц
- **Recharts** или **ECharts** для графиков
- **Lucide** для иконок
- **Tailwind CSS** либо CSS Modules + tokens

Если нужна максимальная скорость разработки, подойдет:
- React
- TypeScript
- Tailwind
- TanStack Query
- Zustand
- Recharts

---

## 8. Рекомендуемая структура проекта

```text
src/
  app/
    providers/
    router/
    store/
  pages/
    DashboardPage/
    PortfolioBuilderPage/
    DataUploadPage/
    PortfolioRiskPage/
    ScenarioRiskPage/
    StressTestingPage/
  widgets/
    app-shell/
    sidebar/
    topbar/
    kpi-card/
    chart-card/
    matrix-card/
    validation-log/
    request-debug/
    summary-strip/
  features/
    positions/
      positions-table/
      position-form-modal/
      position-import-review/
    scenarios/
      scenarios-table/
      scenario-form-modal/
      scenario-templates/
    limits/
      limits-table/
      limits-editor/
    run-config/
      run-config-panel/
    calculations/
      calculate-button/
      calculation-actions/
      result-mappers/
    upload/
      csv-dropzone/
      mapping-panel/
      upload-preview/
  entities/
    position/
    scenario/
    limit/
    calculation/
  shared/
    api/
    config/
    lib/
    ui/
    types/
    constants/
    formatters/
```

---

## 9. Доменные сущности на фронте

Нужно явно разделить:

### 9.1 Draft entities
Это то, что редактирует пользователь.

- `PositionDraft`
- `ScenarioDraft`
- `LimitsDraft`
- `RunConfigDraft`

### 9.2 Result entities
Это то, что приходит после расчета и только отображается.

- `CalculationResult`
- `ValidationMessage`
- `StressResult`
- `TopContributorRow`
- `CorrelationMatrix`
- `PnlDistribution`
- `LiquidityBreakdownRow`

### 9.3 View models
Это уже подготовленные данные под UI.

Примеры:
- `SummaryKpiVm`
- `PnlChartVm`
- `HeatmapVm`
- `ContributorTableVm`
- `StressTableVm`
- `LimitsCheckVm`

Нельзя смешивать чистые transport-модели и UI-модели в одном слое.

---

## 10. Контракт данных для слоя интеграции

Ниже нужен точный набор типов, чтобы интерфейс работал без угадывания.

### 10.1 Позиция

```ts
export type InstrumentType = "option" | "forward" | "swap_ir";
export type OptionType = "call" | "put";
export type OptionStyle = "european" | "american";

export type PositionDraft = {
  instrument_type?: InstrumentType;
  position_id: string;
  option_type?: OptionType;
  style?: OptionStyle;
  quantity: number;
  notional?: number;
  underlying_symbol: string;
  underlying_price: number;
  strike: number;
  volatility?: number;
  maturity_date: string;
  valuation_date: string;
  risk_free_rate: number;
  dividend_yield?: number;
  currency?: string;
  liquidity_haircut?: number;
  model?: string | null;
  fixed_rate?: number | null;
  float_rate?: number | null;
  day_count?: number | null;
};
```

### 10.2 Сценарий

```ts
export type ScenarioDraft = {
  scenario_id: string;
  underlying_shift?: number;
  volatility_shift?: number;
  rate_shift?: number;
  probability?: number | null;
};
```

### 10.3 Конфиг расчета

```ts
export type RunConfigDraft = {
  alpha?: number;
  horizon_days?: number;
  parametric_tail_model?: "normal" | "cornish_fisher";
  base_currency?: string;
  fx_rates?: Record<string, number> | null;
  liquidity_model?:
    | "fraction_of_position_value"
    | "half_spread_fraction"
    | "absolute_per_contract";
  mode?: "demo" | "api" | string;
  calc_sensitivities?: boolean;
  calc_var_es?: boolean;
  calc_stress?: boolean;
  calc_margin_capital?: boolean;
  calc_correlations?: boolean;
};
```

### 10.4 Полный запрос на расчет

```ts
export type MetricsRequest = {
  positions: PositionDraft[];
  scenarios: ScenarioDraft[];
  limits?: Record<string, any> | null;
  alpha?: number;
  horizon_days?: number;
  parametric_tail_model?: "normal" | "cornish_fisher";
  base_currency?: string;
  fx_rates?: Record<string, number> | null;
  liquidity_model?:
    | "fraction_of_position_value"
    | "half_spread_fraction"
    | "absolute_per_contract";
  mode?: "demo" | "api" | string;
  calc_sensitivities?: boolean;
  calc_var_es?: boolean;
  calc_stress?: boolean;
  calc_margin_capital?: boolean;
  calc_correlations?: boolean;
};
```

### 10.5 Сообщения валидации

```ts
export type ValidationMessage = {
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  row?: number | null;
  field?: string | null;
};
```

### 10.6 Stress rows

```ts
export type StressResult = {
  scenario_id: string;
  pnl: number;
  limit: number | null;
  breached: boolean;
};
```

### 10.7 Top contributors

```ts
export type TopContributorRow = {
  metric: "var_hist" | "es_hist" | "stress";
  position_id: string;
  pnl_contribution: number;
  abs_pnl_contribution: number;
  scenario_id?: string;
};
```

### 10.8 Полный результат расчета

```ts
export type MetricsResponse = {
  base_value: number;
  var_hist: number | null;
  es_hist: number | null;
  var_param: number | null;
  es_param: number | null;
  lc_var: number | null;
  lc_var_addon: number | null;
  lc_var_breakdown:
    | Array<{
        position_id: string;
        model: string;
        quantity: number;
        position_value: number;
        haircut_input: number;
        add_on_money: number;
      }>
    | null;
  greeks: Record<string, number> | null;
  stress: StressResult[] | null;
  top_contributors: {
    var_hist: TopContributorRow[];
    es_hist: TopContributorRow[];
    stress: TopContributorRow[];
  } | null;
  limits: Array<[string, number, number, boolean]> | null;
  correlations: number[][] | null;
  pnl_matrix: number[][] | null;
  pnl_distribution: number[] | null;
  buckets: Record<string, Record<string, number>> | null;
  base_currency: string;
  confidence_level: number;
  horizon_days: number;
  parametric_tail_model: string;
  mode: string;
  liquidity_model: string;
  methodology_note: string | null;
  fx_warning: string | null;
  capital: number | null;
  initial_margin: number | null;
  variation_margin: number | null;
  validation_log: ValidationMessage[];
};
```

---

## 11. Слой запросов

Нужны 4 основных вызова.

```ts
GET  /api/health
GET  /api/limits
GET  /api/scenarios
POST /api/metrics
```

### 11.1 Правила для request client

Нужен единый `apiClient`, который:
- добавляет `x-request-id` в каждый запрос;
- вытаскивает из ответа `x-request-id` и `x-trace-id`;
- пробрасывает их в store;
- умеет нормализовать ошибки 422 / 400 / 500;
- поддерживает abort предыдущего расчета при новом запуске;
- умеет таймаутить долгий запрос.

### 11.2 Ошибки

Фронт должен различать:

#### Validation error
Когда пришел 422.
Нужно:
- привязать ошибки к полям и строкам;
- подсветить проблемные input;
- открыть нужный editor section автоматически;
- показать верхний banner "Request validation failed".

#### Business error
Когда пришел 400.
Нужно:
- показать banner с `message`;
- сохранить request/trace id;
- не терять введенные данные;
- дать возможность быстро исправить config.

#### Internal error
Когда пришел 500.
Нужно:
- показать безопасный human-readable текст;
- раскрываемый блок `Technical details`;
- requestId и traceId рядом кнопкой copy.

---

## 12. Глобальные UX-состояния

Во всем приложении должны быть единые состояния.

### 12.1 Loading
- skeleton для карточек;
- skeleton для таблиц;
- disabled состояние кнопки Calculate;
- spinner в правом верхнем углу header или внутри CTA.

### 12.2 Empty
Примеры:
- нет позиций;
- нет сценариев;
- нет лимитов;
- расчет еще не запускался;
- `correlations === null`;
- `pnl_matrix === null`.

### 12.3 Partial data
Очень важно.
Некоторые части результата могут отсутствовать и это не ошибка.
Например:
- `stress = null`
- `correlations = null`
- `pnl_matrix = null`
- `limits = null`

В таких случаях нельзя ронять страницу. Нужно показывать аккуратную пустую карточку:
- title;
- одно пояснение;
- optionally action.

### 12.4 Success with warnings
Это отдельный кейс. Расчет может быть успешным, но содержать `validation_log` с WARNING/INFO.
Нужно:
- показать верхний статус-блок;
- рядом count badge;
- раскрывающийся panel с логом;
- warnings выделить amber, info blue, errors red.

---

## 13. App shell

### 13.1 Sidebar

Структура:
- логотип / mark;
- product name `Risk Calculator`;
- список разделов;
- опционально кнопка collapse;
- внизу small health indicator.

Пункты:
- Dashboard
- Portfolio Builder
- Data Upload
- Portfolio Risk
- Scenario Risk
- Stress Testing

Внизу sidebar:
- точка статуса `Connected` / `Disconnected`;
- hover tooltip c последним check time.

### 13.2 Topbar

Слева:
- title текущей страницы;
- optional subtitle.

Справа:
- global search / command palette trigger;
- save/export icon;
- settings icon;
- profile icon.

По центру или справа можно держать `Run Status Chip`:
- Draft
- Ready to calculate
- Calculating
- Updated just now
- Error

---

## 14. Dashboard

Это обзорный экран. Он нужен не только для красоты, а чтобы пользователь сразу видел главное состояние системы.

### 14.1 Цель экрана

Показать:
- текущий размер портфеля;
- базовую стоимость;
- главные risk metrics;
- последние warnings;
- последние stress signals;
- готовность данных к расчету.

### 14.2 Layout

Сетка:
- верхняя строка: 4 KPI cards;
- средняя строка: Risk Distribution и Risk Contribution;
- нижняя строка: validation summary, scenario summary, run config summary.

### 14.3 KPI cards

Рекомендуемые KPI:
1. Base Value
2. Historical VaR
3. Expected Shortfall
4. LC VaR или Capital

Второй ряд KPI chips:
- Portfolio Positions count
- Scenarios count
- Base currency
- Horizon
- Confidence level

### 14.4 Источники данных для карточек

- `base_value` -> Base Value
- `var_hist` -> Historical VaR
- `es_hist` -> ES
- `lc_var` -> LC VaR
- `capital` -> Capital
- `initial_margin` -> Initial Margin
- `variation_margin` -> Variation Margin

### 14.5 Risk Distribution chart

Использовать `pnl_distribution`.

Вариант отображения:
- строим histogram / density estimate по массиву значений;
- поверх показываем вертикальные маркеры:
  - 0 line;
  - VaR line;
  - ES line.

Если `pnl_distribution === null`:
- карточка остается в дизайне;
- внутри текст: `No scenario distribution available`.

### 14.6 Risk Contribution chart

Источник:
- `top_contributors.var_hist`
- `top_contributors.es_hist`
- `top_contributors.stress`

На dashboard лучше показывать top 5 по absolute contribution.

---

## 15. Portfolio Builder

Это ключевой экран сборки данных. По смыслу он должен объединять то, что на референсе выглядит как “конструктор портфеля”.

### 15.1 Цель экрана

Дать пользователю место, где он:
- создает позиции;
- редактирует их;
- управляет сценариями;
- задает лимиты;
- настраивает run config;
- запускает расчет.

### 15.2 Layout

Экран делим на 3 вертикальные зоны, но визуально аккуратно.

#### Левая зона
Таблицы и список данных.

#### Центральная зона
Графики / previews / summary cards.

#### Правая narrow zone
Quick controls и calculate panel.

### 15.3 Вкладки внутри экрана

Нужны вкладки:
- `Positions`
- `Scenarios`
- `Limits`
- `Run Config`

Визуально это компактные top tabs внутри main area. Не отдельная громоздкая навигация.

### 15.4 Positions tab

Главный блок - таблица позиций.

Колонки:
- position_id
- instrument_type
- underlying_symbol
- option_type
- style
- quantity
- notional
- underlying_price
- strike
- volatility
- maturity_date
- valuation_date
- risk_free_rate
- dividend_yield
- currency
- liquidity_haircut
- model
- fixed_rate
- float_rate
- day_count
- actions

Нужно поддержать:
- inline sort;
- column hide/show;
- row selection;
- duplicate row;
- delete row;
- bulk delete;
- add new row;
- open row in modal editor.

### 15.5 Position form modal

Поля формы должны менять состав в зависимости от `instrument_type`.

#### Общие поля
- position_id
- quantity
- notional
- underlying_symbol
- underlying_price
- strike
- maturity_date
- valuation_date
- risk_free_rate
- currency
- liquidity_haircut

#### Только для option
- option_type
- style
- volatility
- dividend_yield
- model

#### Только для swap_ir
- fixed_rate
- float_rate
- day_count

### 15.6 Правила отображения по типу инструмента

#### option
Показывать все option-поля.

#### forward
Скрывать или disabled:
- option_type
- style
- dividend_yield
- model

`volatility` может быть отображена, но как optional / disabled depending on UX. Лучше скрыть, чтобы не путать.

#### swap_ir
Показывать:
- fixed_rate
- float_rate
- day_count

Поля опционной модели скрывать.

### 15.7 Client-side validation для позиции

Нужно проверять до отправки:
- `position_id` обязателен;
- `quantity !== 0`;
- `underlying_symbol` обязателен;
- `underlying_price > 0`;
- `strike > 0`;
- `maturity_date > valuation_date`;
- `currency` длиной 3 символа;
- для `option`: `volatility > 0`.

Ошибки показывать:
- inline под полем;
- красная рамка input;
- строка таблицы получает red dot.

### 15.8 Scenario tab

Таблица сценариев.

Колонки:
- scenario_id
- underlying_shift
- volatility_shift
- rate_shift
- probability
- actions

Нужно:
- Add Scenario;
- Duplicate;
- Delete;
- Import defaults;
- Normalize probability helper;
- Preset quick actions: Base / Mild Down / Mild Up / Shock Down / Shock Up.

### 15.9 Rules for scenario probabilities

Если probability задано хотя бы в одной строке, фронт должен:
- подсветить, что probability теперь ожидается у всех строк;
- показывать в header mini badge `Weighted mode`;
- считать сумму probabilities и показывать ее;
- если сумма не 1, показывать helper, но не блокировать сохранение;
- предлагать кнопку `Normalize to 1.0`.

### 15.10 Limits tab

Таблица лимитов.

Поля:
- var_hist
- es_hist
- var_param
- es_param
- lc_var
- stress[scenario_id]

UI:
- simple editable grid;
- секция general limits;
- секция stress limits by scenario;
- кнопка `Load Defaults`;
- кнопка `Clear Limits`.

### 15.11 Run Config tab

Элементы:
- Alpha
- Horizon days
- Parametric tail model
- Base currency
- Liquidity model
- Mode
- Toggles:
  - Calc sensitivities
  - Calc VaR/ES
  - Calc stress
  - Calc margin/capital
  - Calc correlations
- FX rates editor

### 15.12 FX rates editor

Это небольшой sub-table:
- currency code
- rate to base currency

Автоматически показывать только если в портфеле больше одной валюты.

Если currencies found = [`RUB`, `USD`, `EUR`] и base currency = `RUB`, то показывать строки:
- USD -> rate
- EUR -> rate

Для base currency строка не нужна.

### 15.13 Quick preview panel справа

Правая узкая панель сохраняет эстетику референса.
Там размещаем:

- run status;
- positions count;
- scenarios count;
- last updated;
- кнопка `Calculate`;
- secondary button `Reset Draft`;
- small preview chart по `pnl_distribution`, если результат уже есть.

---

## 16. Data Upload

Этот экран нужен для CSV-first сценария.

### 16.1 Цель экрана

Пользователь должен:
- перетащить CSV;
- увидеть превью;
- замапить колонки;
- проверить типы данных;
- импортировать в draft-портфель.

### 16.2 Layout

Сохраняем layout как в референсе:
- слева большой drag-and-drop card;
- справа narrow preview/config panel;
- снизу mapping section.

### 16.3 Upload card

Содержит:
- иконку облака;
- заголовок `Drag & drop your CSV file here`;
- подзаголовок `or click to upload`;
- допустимые форматы: `.csv`;
- helper по кодировке и delimiter.

### 16.4 После загрузки файла

Нужно показать:
- file name;
- rows count;
- columns count;
- delimiter guess;
- preview первых 10-20 строк.

### 16.5 Mapping panel

Нужны mapping-поля:
- CSV column -> `position_id`
- CSV column -> `instrument_type`
- CSV column -> `option_type`
- CSV column -> `style`
- CSV column -> `quantity`
- CSV column -> `notional`
- CSV column -> `underlying_symbol`
- CSV column -> `underlying_price`
- CSV column -> `strike`
- CSV column -> `volatility`
- CSV column -> `maturity_date`
- CSV column -> `valuation_date`
- CSV column -> `risk_free_rate`
- CSV column -> `dividend_yield`
- CSV column -> `currency`
- CSV column -> `liquidity_haircut`
- CSV column -> `model`
- CSV column -> `fixed_rate`
- CSV column -> `float_rate`
- CSV column -> `day_count`

### 16.6 Mapping UX

Для каждого required target field:
- dropdown выбора колонки;
- auto-match по названию;
- indicator matched / missing;
- sample value preview.

### 16.7 Upload review

После маппинга показывать validation preview:
- сколько строк валидны;
- сколько строк с ошибками;
- список ошибок по строкам;
- режим `Skip invalid rows` или `Block import on errors`.

Рекомендуемый режим по умолчанию: `Block import on errors`.

### 16.8 Import result

После подтверждения:
- импортируем в `positionsDraft`;
- открываем Portfolio Builder / Positions;
- показываем toast `27 positions imported`.

---

## 17. Portfolio Risk

Это главный аналитический экран по текущему результату.

### 17.1 Цель экрана

Показать весь расчет по портфелю в виде аналитического summary.

### 17.2 Layout

Верх:
- tabs `Summary`, `VaR`, `Sensitivities`, `Contributors`, `Limits`.

Средняя зона:
- слева distribution chart;
- справа correlation heatmap.

Нижняя зона:
- key risk table;
- optional liquidity breakdown table.

### 17.3 Summary tab

Показываем KPI:
- Base Value
- Historical VaR
- Historical ES
- Parametric VaR
- Parametric ES
- LC VaR
- Capital
- Initial Margin
- Variation Margin

### 17.4 Distribution card

Основной график распределения:
- histogram / density по `pnl_distribution`;
- shaded negative tail;
- markers for VaR and ES;
- hover tooltip: scenario index / value.

### 17.5 Correlation matrix

Источник: `correlations`.

Требования:
- heatmap NxN;
- axis labels position ids;
- hover cell tooltip с `rowId`, `colId`, `corr`;
- color scale from blue to red;
- diagonal always highlighted.

Если матрица слишком большая:
- support zoom / scroll;
- sticky axes if possible;
- small note if matrix unavailable.

### 17.6 Key risk table

Столбцы:
- Metric
- Value
- Unit / Currency
- Limit
- Breached
- Notes

Строки:
- base_value
- var_hist
- es_hist
- var_param
- es_param
- lc_var
- capital
- initial_margin
- variation_margin

### 17.7 Limits interpretation

Если есть `limits`, то массив tuples `[metric_name, value, limit, breached]` нужно превратить в нормальные объекты view model:

```ts
{
  metric: string;
  value: number;
  limit: number;
  breached: boolean;
}
```

Цвета:
- breached true -> red badge;
- safe -> green badge.

### 17.8 Sensitivities tab

Если `greeks !== null`, показать карточки и таблицу.

Карточки:
- Delta
- Gamma
- Vega
- Theta
- Rho
- DV01

Под ними таблица:
- greek name
- value
- interpretation.

### 17.9 Liquidity section

Если `lc_var_breakdown !== null`, добавить отдельную карту / table:
- position_id
- model
- quantity
- position_value
- haircut_input
- add_on_money

Над таблицей показать:
- LC VaR Add-on
- LC VaR final.

---

## 18. Scenario Risk

Этот экран про работу со сценариями и распределениями.

### 18.1 Цель экрана

Показать, как портфель ведет себя по заданному набору сценариев.

### 18.2 Layout

Верх:
- scenario distribution chart;
- exposure / bucket chart;
- live preview mini card.

Низ:
- scenario results table;
- top contributors by selected metric;
- optional per-position matrix view.

### 18.3 Scenario results table

Источник:
- `scenariosDraft`
- `stress`
- `pnl_distribution`

Нужно собрать table rows так:
- scenario_id
- underlying_shift
- volatility_shift
- rate_shift
- probability
- pnl
- limit
- breached

Даже если `stress === null`, но есть `pnl_distribution`, таблица должна все равно строиться.

### 18.4 Выбор активного сценария

Пользователь кликает на строку таблицы или bar point.
Это обновляет:
- detail card;
- contributors table;
- stress chart focus;
- selected scenario badge.

### 18.5 Contributors view

Использовать `top_contributors.stress`, `top_contributors.var_hist`, `top_contributors.es_hist`.

Нужен сегментированный переключатель:
- `Hist VaR`
- `Hist ES`
- `Stress`

Таблица:
- position_id
- pnl_contribution
- abs_pnl_contribution
- scenario_id

### 18.6 Buckets section

Если `buckets !== null`, показывать stacked bars или grouped table.

Реализация:
- outer level key, например `currency`;
- inner map metric -> value.

UI:
- слева список bucket groups;
- справа chart/table.

---

## 19. Stress Testing

Это экран сценарного анализа с фокусом на крайние движения.

### 19.1 Цель экрана

Дать пользователю место, где он:
- быстро выбирает сценарий;
- видит стресс-PnL;
- видит breach;
- смотрит contributors;
- может сравнить несколько стрессов.

### 19.2 Layout

Сохраняем референс:
- слева большая chart card;
- справа компактный control panel;
- снизу losses table.

### 19.3 Control panel

Элементы:
- Scenario dropdown;
- Underlying shift input;
- Vol shift input;
- Rate shift input;
- Probability input optional;
- кнопка `Apply as temporary scenario`;
- кнопка `Save scenario`.

### 19.4 Режимы работы

Два режима:

#### A. Existing scenario mode
Пользователь выбирает одну из уже существующих строк.

#### B. Temporary scenario mode
Пользователь вручную вводит shifts, и это создает preview-only сценарий, не меняя draft, пока не нажата `Save scenario`.

### 19.5 Main stress chart

Нужно показать один из вариантов:
- distribution under selected stress;
- либо comparison base vs stress;
- либо line/bar of scenario pnl values.

Чтобы не спорить с референсом, лучше сделать:
- main left chart = smooth area comparison `base vs selected stress response`.

### 19.6 Losses table

Столбцы:
- Scenario
- PnL
- Limit
- Breached
- Rank by loss

Сортировка по умолчанию: от худшего PnL к лучшему.

### 19.7 Stress badges

Рядом с названием сценария показывать:
- `Loss` / `Gain`;
- `Breached` / `Within Limit`;
- magnitude chip.

---

## 20. Settings / Run Config drawer

Чтобы не делать отдельный тяжелый экран, часть настроек лучше открыть через drawer справа.

### 20.1 Содержимое drawer

Секции:
- Base Settings
- Tail Model
- Liquidity
- FX
- Calculation Blocks
- Advanced / Debug

### 20.2 Base Settings
- Alpha
- Horizon days
- Base currency
- Mode

### 20.3 Tail Model
- normal
- cornish_fisher

### 20.4 Liquidity
- fraction_of_position_value
- half_spread_fraction
- absolute_per_contract

### 20.5 Calculation blocks
Тогглы:
- sensitivities
- var / es
- stress
- margin / capital
- correlations

### 20.6 Advanced / Debug
- show request payload preview
- show raw response preview
- show technical details on error

---

## 21. Карты данных: от результата к UI

Ниже точное сопоставление полей результата и UI-блоков.

### 21.1 Summary cards

| UI card | Source field |
|---|---|
| Base Value | `base_value` |
| Hist VaR | `var_hist` |
| Hist ES | `es_hist` |
| Param VaR | `var_param` |
| Param ES | `es_param` |
| LC VaR | `lc_var` |
| Capital | `capital` |
| Initial Margin | `initial_margin` |
| Variation Margin | `variation_margin` |

### 21.2 Distribution chart

Основной источник:
- `pnl_distribution`

Дополнительные маркеры:
- `var_hist`
- `es_hist`
- `var_param`
- `es_param`

### 21.3 Correlation heatmap

Источник:
- `correlations`

Axis labels:
- `positionsDraft.map(p => p.position_id)`

### 21.4 Liquidity table

Источник:
- `lc_var_breakdown`

### 21.5 Stress table

Источник:
- `stress`

### 21.6 Contributors table

Источник:
- `top_contributors`

### 21.7 Validation panel

Источник:
- `validation_log`
- `fx_warning`
- `methodology_note`

### 21.8 Limits panel

Источник:
- `limits`

---

## 22. Форматирование чисел

Нужен единый слой форматтеров.

### 22.1 Currency

Для денежных значений:
- показывать с разделителями тысяч;
- 2 знака после запятой;
- suffix base currency.

Пример:
- `1250000.25 RUB`
- либо `1 250 000.25 RUB`

### 22.2 Percent-like shifts

Поля shift и volatility shift хранить в десятичном формате, но в UI показывать как проценты.

Пример:
- `0.05` <-> `5%`
- `-0.02` <-> `-2%`

Нужно аккуратно конвертировать в обе стороны.

### 22.3 Rates

`risk_free_rate`, `dividend_yield`, `fixed_rate`, `float_rate` тоже хранить в decimal, отображать как `%`.

### 22.4 Null values

Если поле `null`, не выводить `null` или `0` автоматически.
Показывать:
- `-`
- или `Not calculated` в helper text.

---

## 23. Валидация форм

### 23.1 До отправки

Нужно проверять базовые ошибки сразу на клиенте.
Это уменьшает количество 422 и делает UX чище.

### 23.2 После ответа 422

Если пришли server-side details, нужно:
- распарсить path к полю;
- найти соответствующую строку и поле;
- пометить field-level error;
- проскроллить до проблемной строки.

### 23.3 Версионность ошибок

Ошибки клиента и ошибки ответа надо хранить отдельно:
- `clientValidationErrors`
- `requestValidationErrors`

---

## 24. Validation log panel

Это отдельный важный UI-элемент.

### 24.1 Где он показывается

- компактный badge в header;
- full panel на Dashboard;
- collapsible card на аналитических экранах.

### 24.2 Группировка

Сортировать по severity:
1. ERROR
2. WARNING
3. INFO

### 24.3 Вид строки

Каждая строка:
- severity icon;
- message;
- row if exists;
- field if exists;
- timestamp local receive time.

### 24.4 Специальные сообщения

Отдельно сверху показать, если есть:
- `fx_warning`
- `methodology_note`

---

## 25. Debug panel

Для продакта она может быть скрыта за toggle `Advanced`.

### 25.1 Что там должно быть
- raw request JSON;
- raw response JSON;
- requestId;
- traceId;
- response time;
- status code;
- copy buttons.

### 25.2 Зачем это нужно

Это сильно ускорит дебаг интеграции и проверку спорных кейсов.

---

## 26. Запуск расчета

### 26.1 CTA behavior

Главная кнопка `Calculate` должна:
- собрать текущий draft;
- прогнать client validation;
- заблокировать повторный клик на время запроса;
- показать progress;
- сохранить результат в global store;
- обновить все аналитические страницы;
- записать time of calculation.

### 26.2 Когда кнопка disabled

Кнопка заблокирована если:
- нет позиций;
- есть критические client validation errors;
- запрос уже выполняется.

### 26.3 Что не должно происходить

- нельзя очищать draft после расчета;
- нельзя сбрасывать текущую страницу;
- нельзя терять selection пользователя;
- нельзя скрывать warnings.

---

## 27. Query и store стратегия

### 27.1 Что хранить в query cache

Через TanStack Query:
- `health`
- `defaultScenarios`
- `defaultLimits`

### 27.2 Что хранить в global store

Через Zustand/Redux:
- all drafts;
- current result;
- ui selections;
- debug info;
- current selected scenario;
- current selected contributor metric.

### 27.3 Что держать локально в компоненте

Локально:
- modal open state;
- table filters;
- temporary search;
- drawer tabs.

---

## 28. Chart library требования

### 28.1 Общие правила

Все графики должны поддерживать:
- dark theme;
- кастомные tooltip;
- responsive width;
- stable render on empty/null.

### 28.2 Distribution chart

Нужно либо:
- histogram,
- либо KDE area.

Если делается KDE, важно не переусердствовать с "красотой" и не искажать данные.
Лучше сохранить читаемость.

### 28.3 Correlation matrix

Если библиотека графиков неудобна для heatmap, матрицу можно собрать как CSS grid / canvas компонент.
Главное:
- скорость;
- hover;
- color scale;
- labels.

### 28.4 Contributor charts

Подойдут:
- vertical bars;
- horizontal bars;
- stacked bars при bucket views.

---

## 29. Search, filter, sort

### 29.1 Global search

Не обязателен как полнофункциональный поиск по всему продукту, но в topbar и на builder-экранах нужно хотя бы:
- поиск позиции по `position_id`;
- поиск по `underlying_symbol`;
- поиск сценария по `scenario_id`.

### 29.2 Table filter presets

Для positions полезны quick filters:
- Options
- Forwards
- Swaps
- Long
- Short
- Multi-currency

Для scenarios:
- With probability
- Stress only
- Base-like

---

## 30. Экспорт

Нужно поддержать экспорт:

### 30.1 JSON export

- drafts;
- result.

### 30.2 CSV export

- positions table;
- scenarios table;
- stress results table;
- contributors table.

### 30.3 PNG / screenshot export

Опционально можно дать экспорт selected card as image, но это уже nice to have.

---

## 31. Empty states по экранам

### Dashboard
`No calculation results yet. Add positions and run the first calculation.`

### Portfolio Builder / Positions
`No positions yet. Add manually or upload CSV.`

### Scenarios
`No scenarios yet. Load defaults or create your own.`

### Limits
`Limits are not set. You can still calculate without them.`

### Portfolio Risk / Correlations
`Correlation matrix is unavailable for the current run.`

### Stress Testing
`Stress results will appear after calculation with scenarios enabled.`

---

## 32. Компоненты, которые обязательно нужны

### Shell
- `AppShell`
- `Sidebar`
- `Topbar`

### Status
- `HealthIndicator`
- `RunStatusChip`
- `ValidationBadge`

### Cards
- `KpiCard`
- `MetricCard`
- `ChartCard`
- `TableCard`
- `EmptyStateCard`

### Forms
- `PositionFormModal`
- `ScenarioFormModal`
- `LimitsEditor`
- `RunConfigPanel`
- `FxRatesEditor`

### Tables
- `PositionsTable`
- `ScenariosTable`
- `LimitsTable`
- `StressResultsTable`
- `ContributorsTable`
- `LiquidityBreakdownTable`
- `KeyRiskTable`

### Charts
- `PnlDistributionChart`
- `RiskContributionChart`
- `ScenarioBarChart`
- `CorrelationHeatmap`
- `MiniTrendChart`

### Support
- `ValidationLogPanel`
- `DebugDrawer`
- `RequestMetaPanel`
- `CsvDropzone`
- `ColumnMappingPanel`

---

## 33. Что делать с полями, которые не всегда нужны

Нужно не показывать пользователю всю техническую схему сразу.

### Принцип progressive disclosure

Сначала пользователь видит только базовые поля.
Дополнительные поля раскрываются:
- по типу инструмента;
- по toggle `Advanced`;
- по наличию мультивалюты;
- по наличию stress / limits / warnings.

Так интерфейс остается чистым и близким к референсу.

---

## 34. Типовые пользовательские сценарии

### 34.1 Ручной расчет простого портфеля

1. Открыть Portfolio Builder.
2. Add Position.
3. Выбрать instrument type.
4. Заполнить поля.
5. Зайти во вкладку Scenarios.
6. Load Defaults.
7. Проверить Run Config.
8. Нажать Calculate.
9. Перейти в Portfolio Risk.
10. Изучить Summary и Correlations.

### 34.2 Расчет с лимитами

1. Подгрузить портфель.
2. Подгрузить дефолтные лимиты.
3. Запустить расчет.
4. Перейти в Portfolio Risk -> Limits.
5. Посмотреть breach.
6. Открыть Stress Testing для stress breaches.

### 34.3 CSV upload flow

1. Открыть Data Upload.
2. Перетащить CSV.
3. Замапить колонки.
4. Проверить ошибки.
5. Import into draft.
6. Перейти в Builder.
7. Run calculation.

### 34.4 Weighted scenarios

1. Открыть Scenarios.
2. Добавить probability для одного сценария.
3. UI переводит набор в weighted mode.
4. Заполнить probabilities у всех.
5. При сумме != 1 показать helper.
6. Run calculation.

---

## 35. Нюансы реализации, которые нельзя пропустить

### 35.1 Порядок сценариев важен

`pnl_distribution` соответствует порядку сценариев во входном массиве.
Поэтому на фронте нельзя самовольно reorder scenarios перед расчетом, если потом результат хочется корректно сопоставить со строками.

Если пользователь отсортировал таблицу сценариев в UI, это должен быть только visual sort, а не изменение фактического порядка draft без явного подтверждения.

### 35.2 Limits могут отсутствовать

Если limits не заданы, блок Limits должен красиво деградировать, а не показывать пустую таблицу с ошибкой.

### 35.3 Correlations и pnl_matrix могут отсутствовать

Это нормальный случай.

### 35.4 Некоторые значения приходят как `0.0` вместо NaN/Inf

Не нужно дополнительно считать, что это обязательно "реальный ноль". В спорных местах полезно показывать helper text, если расчет выглядит подозрительно.

### 35.5 Variation margin

Показывается как отдельная метрика, но в UI не надо изобретать собственный расчет. Просто отображать как пришло.

---

## 36. UX для requestId / traceId

Если произошла ошибка или расчет завершился с warning, пользователь должен иметь доступ к:
- requestId;
- traceId.

Показывать это можно:
- в debug drawer;
- в error banner expandable section;
- в small meta footer на аналитических экранах.

---

## 37. Performance требования

### 37.1 Таблицы

Если строк много, таблицы должны поддерживать:
- virtualization;
- sticky header;
- column resize;
- keyboard navigation.

### 37.2 Heatmap

Для больших NxN матриц нужен canvas-based рендер либо оптимизированный grid.

### 37.3 Re-render control

Нельзя пересобирать все графики на каждый символ в форме. Draft editing должен быть отделен от result rendering.

---

## 38. Безопасное состояние при ошибках

Если запрос на расчет упал:
- draft остается целым;
- предыдущий успешный result можно оставить на экране с badge `Outdated`;
- новый результат не должен затирать старый до success.

Это важно.

---

## 39. Accessibility

Даже в таком аналитическом dark UI нужно обеспечить:
- видимый keyboard focus;
- понятные aria-label для иконок;
- contrast ratio для текста и цифр;
- tooltip не только по hover, но и по focus.

---

## 40. Recommended page breakdown по задачам разработки

### Этап 1. Shell и дизайн-система
- AppShell
- Sidebar
- Topbar
- tokens
- card system
- button/input/select styles

### Этап 2. Draft editing
- Positions table
- Position modal
- Scenarios table
- Limits editor
- Run config panel

### Этап 3. Integration layer
- api client
- health
- defaults
- calculate
- error normalization

### Этап 4. Analytics pages
- Dashboard
- Portfolio Risk
- Scenario Risk
- Stress Testing

### Этап 5. Upload
- CSV dropzone
- mapping
- validation preview
- import to draft

### Этап 6. Debug and export
- debug drawer
- export JSON / CSV
- copy request metadata

---

## 41. Acceptance criteria

Ниже критерии готовности.

### 41.1 Визуально
- Интерфейс узнается как тот же dark analytics design.
- Нет грубого отхода от layout и палитры.
- Таблицы, cards, charts выглядят как единая система.

### 41.2 Функционально
- Можно создать позиции вручную.
- Можно загрузить CSV и импортировать позиции.
- Можно создать и редактировать сценарии.
- Можно подгрузить и редактировать лимиты.
- Можно настроить run config.
- Можно запустить расчет.
- Можно увидеть все ключевые поля результата.
- Можно посмотреть warnings и errors.
- Можно увидеть requestId / traceId.

### 41.3 Аналитически
- Отображаются `base_value`, `var_hist`, `es_hist`, `var_param`, `es_param`, `lc_var`, `capital`, `initial_margin`, `variation_margin`.
- Отображаются `greeks`, если они есть.
- Отображается `stress`, если он есть.
- Отображаются `top_contributors`, если они есть.
- Отображается `correlations`, если она есть.
- Отображается `lc_var_breakdown`, если он есть.
- Отображается `validation_log`, если он есть.

### 41.4 UX
- Нет white screen / crash при `null`-полях.
- Ошибки формы читаемы.
- Ошибки запроса понятны.
- Данные пользователя не теряются.

---

## 42. Приоритеты, если делать по уму

### Must have
- App shell
- Builder with positions/scenarios/limits/config
- Calculate flow
- Dashboard
- Portfolio Risk
- Stress table
- Validation / errors

### Should have
- CSV upload
- Contributors views
- Correlation heatmap
- Liquidity breakdown
- Debug drawer

### Nice to have
- export screenshot
- command palette
- richer presets
- saved local drafts

---

## 43. Итоговое правило реализации

Фронт не должен быть просто красивой оберткой над расчетом. Он должен быть:
- аккуратным;
- аналитичным;
- понятным для человека, который реально работает с портфелем и сценариями;
- устойчивым к частичным данным и ошибкам;
- визуально близким к выбранному дизайну.

Главная идея такая:

**Снаружи это спокойный премиальный dark-finance интерфейс. Внутри это полноценный рабочий инструмент с редакторами, загрузкой, расчетом, аналитикой, лимитами, стрессами, валидацией и дебагом.**

