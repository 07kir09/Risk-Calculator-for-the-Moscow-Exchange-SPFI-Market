#!/usr/bin/env python3
"""Manual/cron live market-data sync into a new session."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync live market data (CBR + MOEX) into market-data session storage.")
    parser.add_argument("--as-of", dest="as_of", default=None, help="As-of date in YYYY-MM-DD (default: today).")
    parser.add_argument("--lookback-days", dest="lookback_days", type=int, default=180, help="Lookback window in days.")
    parser.add_argument(
        "--pythonpath",
        dest="pythonpath",
        default=str(Path(__file__).resolve().parents[1]),
        help="Path to add into sys.path for local imports.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    sys.path.insert(0, args.pythonpath)

    from option_risk.data.market_data_sessions import create_session_from_live_sources

    as_of_date = dt.date.fromisoformat(args.as_of) if args.as_of else None
    summary = create_session_from_live_sources(
        as_of_date=as_of_date,
        lookback_days=args.lookback_days,
    )
    payload = {
        "session_id": summary.session_id,
        "ready": summary.ready,
        "blocking_errors": summary.blocking_errors,
        "warnings": summary.warnings,
        "missing_required_files": summary.missing_required_files,
        "counts": summary.counts,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
