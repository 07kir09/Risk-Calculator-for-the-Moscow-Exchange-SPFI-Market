import { mapCsvRowToPosition, parseCsvNumber, suggestColumnMapping } from "../shared/lib/csvImport";
import { uploadMappingTargets } from "../shared/constants/defaults";

describe("csv import helpers", () => {
  test("suggestColumnMapping detects russian headers", () => {
    const headers = [
      "Номер в торговой системе",
      "Продукт",
      "Инструмент",
      "Цена",
      "Сумма 1",
      "Страйк",
      "Срок",
      "Начало",
      "Окончание",
      "Курс",
      "Валюта 1",
    ];

    const mapping = suggestColumnMapping(headers, uploadMappingTargets);
    expect(mapping.position_id).toBe("Номер в торговой системе");
    expect(mapping.instrument_type).toBe("Продукт");
    expect(mapping.underlying_symbol).toBe("Инструмент");
    expect(mapping.underlying_price).toBe("Цена");
    expect(mapping.quantity).toBe("Сумма 1");
    expect(mapping.maturity_date).toBe("Окончание");
    expect(mapping.valuation_date).toBe("Начало");
  });

  test("mapCsvRowToPosition normalizes dates and instrument type", () => {
    const row = {
      "Номер в торговой системе": "6150",
      Продукт: "FX Fwd",
      Инструмент: "FX Fwd EUR/RUB 2W",
      Цена: "91.921",
      "Сумма 1": "1000000",
      Страйк: "",
      Начало: "19.03.2026",
      Окончание: "19.03.2026",
      Курс: "11,27458",
      "Валюта 1": "EUR",
      Направление: "Sell",
    };

    const mapping = suggestColumnMapping(Object.keys(row), uploadMappingTargets);
    const position = mapCsvRowToPosition(row, mapping, 0);

    expect(position.instrument_type).toBe("forward");
    expect(position.position_id).toBe("6150");
    expect(position.valuation_date).toBe("2026-03-19");
    expect(position.maturity_date).toBe("2026-03-19");
    expect(position.quantity).toBeLessThan(0);
    expect(position.currency).toBe("EUR");
  });

  test("parseCsvNumber handles comma and percent", () => {
    expect(parseCsvNumber("11,27")).toBeCloseTo(11.27, 8);
    expect(parseCsvNumber("12.5%")).toBeCloseTo(0.125, 8);
  });

  test("mapCsvRowToPosition parses tenor when maturity date column is absent", () => {
    const row = {
      "Номер в торговой системе": "777",
      Продукт: "FX Fwd",
      Инструмент: "FX Fwd USD/RUB 2W",
      Цена: "90,11",
      "Сумма 1": "1000000",
      Начало: "05.03.2026",
      Срок: "2W",
      Курс: "0.10",
      "Валюта 1": "USD",
      Направление: "Buy",
    };

    const mapping = suggestColumnMapping(Object.keys(row), uploadMappingTargets);
    const position = mapCsvRowToPosition(row, mapping, 0);

    expect(position.valuation_date).toBe("2026-03-05");
    expect(position.maturity_date).toBe("2026-03-19");
    expect(position.underlying_price).toBeGreaterThan(0);
  });

  test("mapCsvRowToPosition keeps strike positive for non-options and prefers registration date", () => {
    const row = {
      "Номер в торговой системе": "6150",
      "Дата регистрации": "05.03.2026",
      Продукт: "FX Fwd",
      Инструмент: "FX Fwd EUR/RUB 2W",
      Начало: "19.03.2026",
      Окончание: "19.03.2026",
      Цена: "91.921",
      "Сумма 1": "1000000",
      Страйк: "",
      "Валюта 1": "EUR",
      Направление: "Sell",
      Комиссии: "-1000",
    };

    const mapping = suggestColumnMapping(Object.keys(row), uploadMappingTargets);
    const position = mapCsvRowToPosition(row, mapping, 0);

    expect(position.instrument_type).toBe("forward");
    expect(position.valuation_date).toBe("2026-03-05");
    expect(position.maturity_date).toBe("2026-03-19");
    expect(position.strike).toBeGreaterThan(0);
    expect(position.liquidity_haircut ?? 0).toBeGreaterThanOrEqual(0);
  });
});
