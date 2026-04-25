from __future__ import annotations

import json
import urllib.error
from pathlib import Path

from backend_smoke_check import BACKEND_URL, REPORTS, parse_json, post_json, row


def sync_live_session() -> tuple[int, dict]:
    status, _, raw = post_json("/market-data/sync-live", {"lookback_days": 180}, timeout=120)
    data = parse_json(raw)
    return status, data if isinstance(data, dict) else {}


def payload(session_id: str) -> dict:
    return {
        "positions": [
            {
                "instrument_type": "forward",
                "position_id": "runtime_eur_rub_forward",
                "option_type": "call",
                "style": "european",
                "quantity": 1,
                "notional": 1_000_000,
                "underlying_symbol": "EUR/RUB",
                "underlying_price": 90.0,
                "strike": 91.0,
                "volatility": 0.0,
                "maturity_date": "2027-01-01",
                "valuation_date": "2026-01-01",
                "risk_free_rate": 0.0,
                "dividend_yield": 0.0,
                "currency": "RUB",
                "liquidity_haircut": 0.0,
                "receive_discount_curve_ref": "EUR-DISCOUNT-RUB-CSA",
                "pay_discount_curve_ref": "RUB-DISCOUNT-RUB-CSA",
            }
        ],
        "scenarios": [
            {"scenario_id": "base", "underlying_shift": 0.0, "volatility_shift": 0.0, "rate_shift": 0.0},
            {"scenario_id": "shock_down", "underlying_shift": -0.05, "volatility_shift": 0.0, "rate_shift": 0.0},
        ],
        "base_currency": "RUB",
        "alpha": 0.99,
        "horizon_days": 1,
        "mode": "api",
        "calc_sensitivities": False,
        "calc_var_es": True,
        "calc_stress": True,
        "calc_margin_capital": True,
        "calc_correlations": False,
        "market_data_session_id": session_id,
    }


def write_report(rows: list[dict[str, str]]) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Market-data completeness runtime report",
        "",
        "| Проверка | Ожидание | Факт | Pass/Fail | Комментарий |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in rows:
        lines.append(f"| {item['check']} | {item['expected']} | {item['fact']} | {item['ok']} | {item['comment']} |")
    (REPORTS / "market_data_completeness_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    rows: list[dict[str, str]] = []
    status, live = sync_live_session()
    session_id = str(live.get("session_id") or "")
    rows.append(row("POST /market-data/sync-live", "200 live session", f"{status} {session_id}", status == 200 and bool(session_id), json.dumps(live, ensure_ascii=False)[:240]))

    if not session_id:
        write_report(rows)
        return 1

    status, _, raw = post_json("/metrics", payload(session_id), timeout=60)
    data = parse_json(raw)
    ok = (
        status == 200
        and isinstance(data, dict)
        and data.get("market_data_completeness") == "complete"
        and data.get("market_data_source") == "official_live_rates"
        and data.get("methodology_status") == "preliminary"
        and not (data.get("data_quality") or {}).get("missing_curves")
    )
    rows.append(
        row(
            "POST /metrics with live USD/EUR/CNY curves",
            "200 complete data-quality from official_live_rates/preliminary",
            str(status),
            ok,
            json.dumps(data, ensure_ascii=False)[:400] if isinstance(data, dict) else raw[:200].decode("utf-8", "replace"),
        )
    )

    write_report(rows)
    return 0 if all(item["ok"] == "PASS" for item in rows) else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.URLError:
        print(f"FAIL backend is not reachable at {BACKEND_URL}")
        raise SystemExit(1)
