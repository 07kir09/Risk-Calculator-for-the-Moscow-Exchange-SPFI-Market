from __future__ import annotations

from backend_smoke_check import REPORTS, clean_error, minimal_payload, multipart_upload, parse_json, post_json, http


def item(name: str, expected: str, fact: str, ok: bool, priority: str = "P2") -> dict[str, str]:
    print(f"{'PASS' if ok else 'FAIL'} {name} {fact}")
    return {"name": name, "expected": expected, "fact": fact, "ok": "PASS" if ok else "FAIL", "priority": priority}


def write_report(rows: list[dict[str, str]]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    lines = ["# Negative cases and regression report", "", "| Проверка | Ожидание | Факт | Pass/Fail | Приоритет |", "| --- | --- | --- | --- | --- |"]
    for row in rows:
        lines.append(f"| {row['name']} | {row['expected']} | {row['fact']} | {row['ok']} | {row['priority']} |")
    (REPORTS / "regression_security_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    ux_rows = [
        ("import", "OK", "Есть CSV/XLSX/Paste, invalid paste показывает inline error.", "Оставить как основной вход данных."),
        ("market", "PARTIAL", "Страница зависит от полного набора market-data файлов; ошибки теперь чистые, но пользователю нужен явный список обязательных файлов.", "Добавить checklist обязательных файлов."),
        ("configure", "PARTIAL", "Для USD-портфеля теперь видно, что нужен USD/RUB; без FX расчёт блокируется до понятного исправления.", "Оставить fail-fast и подсказку FX."),
        ("dashboard", "OK", "F5 и seeded runtime работают; validation_log раскрывается; correlations warning не ломает страницу.", "Оставить компактные notices."),
        ("stress", "OK", "Сценарии отображаются, route и e2e проходят.", "Уточнить подписи сценариев позже."),
        ("limits", "PARTIAL", "Ручной/авто режим виден; авто-лимиты убрали демо-порог 5000/7500, но методику лимитов нужно утвердить бизнес-правилом.", "Задать risk-policy baseline вместо чистого факта + buffer."),
        ("export", "OK", "Excel/JSON экспорт работает, e2e проходит, кнопка совместима с accessibility contract.", "Оставить текущую структуру."),
    ]
    ux_lines = [
        "# UX, logic and manageability report",
        "",
        "| Страница | Оценка | Главная проблема | Рекомендация |",
        "| --- | --- | --- | --- |",
    ]
    for page, score, problem, recommendation in ux_rows:
        ux_lines.append(f"| /{page} | {score} | {problem} | {recommendation} |")
    (REPORTS / "ux_logic_report.md").write_text("\n".join(ux_lines) + "\n", encoding="utf-8")


def main() -> int:
    rows: list[dict[str, str]] = []

    status, headers, raw = multipart_upload(REPORTS.parent / "test_data" / "market_data_write_only_5001_rows.xlsx")
    rows.append(item("write_only row-limit bypass", "400", str(status), status == 400, "P1"))

    status, _, raw = post_json("/metrics?include=correlations", minimal_payload())
    data = parse_json(raw)
    rows.append(item("include=correlations", "200 with correlations", f"{status} correlations={type(data.get('correlations')).__name__ if isinstance(data, dict) else 'n/a'}", status == 200 and isinstance(data, dict) and data.get("correlations") is not None, "P2"))

    status, _, raw = post_json("/metrics", minimal_payload())
    data = parse_json(raw)
    rows.append(item("correlations default", "null by default", f"{status} correlations={None if not isinstance(data, dict) else data.get('correlations')}", status == 200 and isinstance(data, dict) and data.get("correlations") is None, "P2"))

    for limits in [{"var_hist": "abc"}, {"var_hist": -1}, {}]:
        status, headers, raw = post_json("/metrics", minimal_payload(limits=limits))
        clean, reason = clean_error(status, headers, raw)
        rows.append(item(f"invalid limits {limits}", "422 clean JSON", f"{status} {reason}", status == 422 and clean, "P2"))

    for path in ["/market-data/..%2Fsecret", "/market-data/%252e%252e%252fsecret", "/market-data/%EF%BC%8E%EF%BC%8E%EF%BC%8Fsecret"]:
        status, headers, raw = http("GET", path)
        rows.append(item(f"traversal {path}", "400", str(status), status == 400, "P3"))

    for session_id in ["../evil", "%00", "%252e%252e", "．．／secret"]:
        status, headers, raw = post_json("/metrics", minimal_payload(mode="api") | {"market_data_session_id": session_id, "auto_market_data": False})
        rows.append(item(f"dirty session_id {session_id}", "400/422/404 clean JSON", str(status), status in {400, 422, 404}, "P2"))

    status, headers, raw = post_json("/metrics", minimal_payload(positions=[
        {
            "instrument_type": "forward",
            "position_id": "usd_fx_missing",
            "option_type": "call",
            "style": "european",
            "quantity": 1,
            "notional": 1,
            "underlying_symbol": "A",
            "underlying_price": 100,
            "strike": 95,
            "volatility": 0,
            "maturity_date": "2026-12-31",
            "valuation_date": "2026-04-25",
            "risk_free_rate": 0.05,
            "dividend_yield": 0,
            "currency": "USD",
            "liquidity_haircut": 0,
        }
    ]))
    rows.append(item("silent FX fallback", "400 if missing USD/RUB", str(status), status == 400, "P2"))

    write_report(rows)
    return 0 if all(row["ok"] == "PASS" for row in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
