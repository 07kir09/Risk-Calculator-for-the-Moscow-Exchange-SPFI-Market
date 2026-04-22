#!/usr/bin/env python3
"""Check freshness of latest ready market-data session."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check market-data session freshness.")
    parser.add_argument("--max-age-days", dest="max_age_days", type=int, default=1, help="Max allowed age in days.")
    parser.add_argument(
        "--pythonpath",
        dest="pythonpath",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to add into sys.path for local imports.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    threshold = max(int(args.max_age_days), 0)
    sys.path.insert(0, args.pythonpath)

    from option_risk.data.market_data_sessions import find_latest_ready_market_data_session, get_market_data_session_dir

    latest = find_latest_ready_market_data_session()
    now = dt.datetime.now(dt.timezone.utc)

    if latest is None:
        print(json.dumps({"ok": False, "reason": "no_ready_sessions", "now": now.isoformat()}, ensure_ascii=False))
        return 2

    session_dir = get_market_data_session_dir(latest.session_id)
    mtime = dt.datetime.fromtimestamp(session_dir.stat().st_mtime, tz=dt.timezone.utc)
    age_days = (now.date() - mtime.date()).days
    ok = age_days <= threshold
    payload = {
        "ok": ok,
        "reason": "ok" if ok else "stale_market_data",
        "latest_session_id": latest.session_id,
        "latest_session_mtime_utc": mtime.isoformat(),
        "age_days": age_days,
        "max_age_days": threshold,
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if ok else 3


if __name__ == "__main__":
    raise SystemExit(main())
