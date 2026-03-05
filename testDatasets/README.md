# Risk Calculator test datasets

This folder contains 3 dataset packs for the project `cod/option_risk/cli.py`.

## How to run
From the repository `cod` directory (or configure PYTHONPATH so `option_risk` is importable):

```bash
python -m option_risk.cli --portfolio <PORTFOLIO_CSV> --scenarios <SCENARIOS_CSV> --limits <LIMITS_JSON> --output <OUT_DIR>
```

⚠️ Note about size:
The current pipeline always builds:
- PnL matrix (positions × scenarios), and
- correlation matrix (positions × positions) if scenarios > 1,
and converts them to Python lists.
That can explode RAM for huge portfolios + many scenarios.
The packs below are sized to be safe.

## Pack 1: HUGE_LOAD_TEST (100k positions, 1 scenario)
Purpose: stress CSV loading + pricing speed for linear instruments only (forwards + swaps).
Scenarios file has only 1 scenario => correlation matrix is NOT built.

```bash
python -m option_risk.cli --portfolio datasets/HUGE_LOAD_TEST/portfolio.csv --scenarios datasets/HUGE_LOAD_TEST/scenarios.csv --output out_huge
```

## Pack 2: VAR_ES_RISK_TEST (120 positions, 2000 scenarios)
Purpose: VaR/ES test with a large scenario distribution, still small enough for correlations.

```bash
python -m option_risk.cli --portfolio datasets/VAR_ES_RISK_TEST/portfolio.csv --scenarios datasets/VAR_ES_RISK_TEST/scenarios.csv --output out_risk
```

## Pack 3: GOLDEN_FORWARD_ONLY (20 forwards, 101 scenarios)
Purpose: correctness check where portfolio PnL can be computed analytically (forward PV is linear in S and uses exp(-rT)).
Expected reference values are in `expected_metrics_alpha0.99.json`.

```bash
python -m option_risk.cli --portfolio datasets/GOLDEN_FORWARD_ONLY/portfolio.csv --scenarios datasets/GOLDEN_FORWARD_ONLY/scenarios.csv --output out_golden
```

Interpretation:
- `var_ceil_order_stat` matches current code (Excel-style дискретный порядок): `k = ceil(N*(1-alpha))`.
- `var_numpy_linear` оставлен как вспомогательный референс для сравнения конвенций.
