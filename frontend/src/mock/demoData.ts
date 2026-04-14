import { PositionDTO } from "../api/types";
import { MetricsResponse, ScenarioDTO } from "../api/contracts/metrics";

export const demoPositions: PositionDTO[] = [
  {
    instrument_type: "option",
    position_id: "call_eu",
    option_type: "call",
    style: "european",
    quantity: 10,
    notional: 1,
    underlying_symbol: "MOEX",
    underlying_price: 100,
    strike: 95,
    volatility: 0.2,
    maturity_date: "2025-12-31",
    valuation_date: "2025-01-01",
    risk_free_rate: 0.06,
    dividend_yield: 0.01,
    currency: "RUB",
    liquidity_haircut: 0.1,
    model: "black_scholes",
  },
  {
    instrument_type: "forward",
    position_id: "fwd_fx",
    option_type: "call",
    style: "european",
    quantity: 3,
    notional: 100000,
    underlying_symbol: "USDRUB",
    underlying_price: 92,
    strike: 90,
    volatility: 0.01,
    maturity_date: "2025-06-30",
    valuation_date: "2025-01-01",
    risk_free_rate: 0.045,
    currency: "RUB",
    liquidity_haircut: 0.0,
  },
];

// Реальные стресс-сценарии российского рынка, откалиброванные по историческим данным.
// ΔS — сдвиг базового актива (доли), ΔVol — сдвиг волатильности, Δr — сдвиг ставки (п.п.)
export const demoScenarios: ScenarioDTO[] = [
  {
    // Сентябрь 2023: USD/RUB достигал 101 руб. Обычная амплитуда ослабления — 15–20%.
    scenario_id: "usd_to_110",
    underlying_shift: 0.20,
    volatility_shift: 0.25,
    rate_shift: 0.02,
    probability: 0.14,
    description:
      "Доллар вырастает до ~110 руб. (+20% от текущего). Исторический прецедент: август–сентябрь 2023. Причина — отток капитала, снижение нефтяных доходов, санкционное давление на экспортёров. ЦБ вынужден поднять ставку.",
  },
  {
    // Типичный «оффшорный» возврат при обязательной продаже валютной выручки.
    scenario_id: "usd_to_80",
    underlying_shift: -0.13,
    volatility_shift: 0.10,
    rate_shift: -0.005,
    probability: 0.10,
    description:
      "Доллар опускается до ~80 руб. (−13%). Механизм: обязательная продажа 80% валютной выручки экспортёров, рост цен на нефть, сезонное сокращение импорта. Рубль укрепляется, давление на длинные позиции по FX.",
  },
  {
    // ЦБ РФ в октябре 2024 поднял ставку сразу до 21%. Исторически ставка шла вверх шагами по 1–2 п.п.
    scenario_id: "cbr_hike_2pp",
    underlying_shift: -0.05,
    volatility_shift: 0.15,
    rate_shift: 0.02,
    probability: 0.13,
    description:
      "ЦБ повышает ключевую ставку на 2 п.п. (например, с 21% до 23%). Прецедент: 2024 год, серия повышений для борьбы с инфляцией. Стоимость фондирования растёт, рынок акций корректируется, деривативы переоцениваются по новой дисконтной кривой.",
  },
  {
    // Смягчение возможно при инфляции ниже 5–6%, ожидается в 2025–2026.
    scenario_id: "cbr_cut_3pp",
    underlying_shift: 0.06,
    volatility_shift: -0.12,
    rate_shift: -0.03,
    probability: 0.11,
    description:
      "ЦБ снижает ключевую ставку на 3 п.п. (сценарий охлаждения инфляции, ожидаемый в 2025–2026). Стоимость кредита падает, рынок акций и облигаций растёт, снижается дисконт в оценке опционов. Позитивно для длинных позиций.",
  },
  {
    // Brent в 2023–2024 опускался ниже $75. При $60 нефтяные доходы РФ падают критически.
    scenario_id: "oil_brent_below_60",
    underlying_shift: -0.11,
    volatility_shift: 0.28,
    rate_shift: 0.015,
    probability: 0.09,
    description:
      "Нефть Brent падает ниже $60/барр. Аналог: обвалы 2020 и 2015–2016 гг. Сокращение нефтегазовых доходов бюджета, давление на рубль (~−10–15%), рост инфляционных рисков. ЦБ ужесточает политику, MOEX теряет 10–15%.",
  },
  {
    // Рост Brent выше $90 при геополитической напряжённости или сокращении добычи ОПЕК+.
    scenario_id: "oil_brent_above_90",
    underlying_shift: 0.07,
    volatility_shift: -0.08,
    rate_shift: -0.01,
    probability: 0.10,
    description:
      "Нефть Brent выше $90/барр. (прецедент: 2022, весна 2024). Рубль укрепляется за счёт роста экспортной выручки, бюджет профицитный. ЦБ может начать цикл снижения ставки. Позитивно для экспортёров, нейтрально–негативно для импортёров.",
  },
  {
    // Индекс MOEX терял >10% за торговую сессию в феврале 2022 и октябре 2022.
    scenario_id: "moex_crash_15pct",
    underlying_shift: -0.15,
    volatility_shift: 0.45,
    rate_shift: 0.01,
    probability: 0.07,
    description:
      "Индекс MOEX падает на 15% за одну сессию. Прецеденты: 24 февраля 2022, октябрь 2022. Причины: внешний шок, неожиданное решение регулятора или экстренные новости. Резкий рост волатильности, паническое закрытие позиций, расширение спредов.",
  },
  {
    // Новые санкции Запада — ограничения на расчёты, заморозка НКЦ-подобных структур.
    scenario_id: "new_sanctions_nsd",
    underlying_shift: -0.14,
    volatility_shift: 0.40,
    rate_shift: 0.025,
    probability: 0.07,
    description:
      "Новый пакет санкций, затрагивающий расчётную инфраструктуру (аналог блокировки НРД/НКЦ в 2022). Заморозка части активов, остановка торгов отдельными инструментами, резкий рост рублёвой процентной ставки, ослабление рубля на 10–15%.",
  },
  {
    // Инфляция в РФ в 2024 превысила 9%; при разгоне до 15%+ возможны экстренные меры.
    scenario_id: "inflation_above_15pct",
    underlying_shift: -0.04,
    volatility_shift: 0.13,
    rate_shift: 0.03,
    probability: 0.08,
    description:
      "Инфляция разгоняется выше 15% (аналог 2015: ~12.9%, или 2022: ~17%). ЦБ вынужден ещё раз резко поднять ставку (+3 п.п.), длинные ОФЗ падают, реальная доходность активов снижается, потребительский спрос сжимается.",
  },
  {
    // Глобальный обвал. В 2022 MSCI EM потерял ~28%. Для РФ-портфеля это выражается в давлении на рубль и MOEX.
    scenario_id: "em_selloff_global",
    underlying_shift: -0.18,
    volatility_shift: 0.38,
    rate_shift: 0.012,
    probability: 0.11,
    description:
      "Глобальная распродажа на рынках развивающихся стран: рецессия в США, рост ставки ФРС, отток из EM. Аналог 2022 (MSCI EM −28%) или 2018 (обострение санкций + распродажа EM). MOEX под давлением, рубль слабеет, рублёвые ставки растут.",
  },
];

export const demoMetrics: MetricsResponse = {
  base_value: 123456.78,
  var_hist: 10000,
  es_hist: 12000,
  var_param: 15000,
  es_param: 18000,
  lc_var: 10500,
  lc_var_addon: 500,
  lc_var_breakdown: [
    {
      position_id: "call_eu",
      model: "fraction_of_position_value",
      quantity: 10,
      position_value: 10000,
      haircut_input: 0.03,
      add_on_money: 300,
    },
    {
      position_id: "fwd_fx",
      model: "fraction_of_position_value",
      quantity: 3,
      position_value: 10000,
      haircut_input: 0.02,
      add_on_money: 200,
    },
  ],
  greeks: { delta: 12.3, gamma: 0.12, vega: 100.5, theta: -20.1, rho: 50.2, dv01: 999.1 },
  stress: [
    { scenario_id: "mild_down", pnl: -500, limit: 9000, breached: false },
    { scenario_id: "shock_down", pnl: -12000, limit: 9000, breached: true },
  ],
  top_contributors: {
    var_hist: [
      { metric: "var_hist", position_id: "call_eu", scenario_id: "shock_down", pnl_contribution: -7000, abs_pnl_contribution: 7000 },
      { metric: "var_hist", position_id: "fwd_fx", scenario_id: "shock_down", pnl_contribution: -3000, abs_pnl_contribution: 3000 },
    ],
    es_hist: [
      { metric: "es_hist", position_id: "call_eu", scenario_id: "tail_mean", pnl_contribution: -6500, abs_pnl_contribution: 6500 },
      { metric: "es_hist", position_id: "fwd_fx", scenario_id: "tail_mean", pnl_contribution: -2800, abs_pnl_contribution: 2800 },
    ],
    stress: [
      { metric: "stress", position_id: "call_eu", scenario_id: "shock_down", pnl_contribution: -7000, abs_pnl_contribution: 7000 },
      { metric: "stress", position_id: "fwd_fx", scenario_id: "shock_down", pnl_contribution: -3000, abs_pnl_contribution: 3000 },
    ],
  },
  limits: [["var_hist", 10000, 9000, true]],
  buckets: { RUB: { notional: 100000, quantity: 13, delta: 12.3 } },
  base_currency: "RUB",
  confidence_level: 0.99,
  horizon_days: 10,
  mode: "demo",
  methodology_note: "Historical VaR/ES рассчитаны на демонстрационных сценариях.",
  liquidity_model: "fraction_of_position_value",
  capital: 12000,
  initial_margin: 10500,
  variation_margin: -500,
};
