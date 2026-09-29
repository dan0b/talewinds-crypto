# 22 — Backtesting & paper trading

- **Phase:** Priority 2 — Agentic trading
- **Status:** Draft
- **Depends on:** [05](05-full-research-report.md), 06–09 (the ledger)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

A safe proving ground: strategies run against historical and live data with simulated fills, before
any real money is involved.

## Scope

- The **trade intent** contract (in `packages/core`), in exactly the format the real executor will
  accept ([ADR 0001](../adr/0001-execution-boundary.md)).
- A simulated executor with realistic fees, slippage, and funding.
- Historical market data storage for backtests (candles, funding rates).
- A backtest runner. Decide here whether this is where the Python escape hatch
  ([ADR 0005](../adr/0005-typescript-monorepo.md)) earns its place.
- Paper portfolios tracked like real accounts but clearly marked as simulated.
- An agent loop skeleton: observe → decide → emit an intent.
- Metrics: return, drawdown, win rate, risk-adjusted return.

## Acceptance criteria

- [ ] A sample strategy runs in both backtest and paper modes, emitting intents in the executor's
      format.
- [ ] Results are reproducible from the same data and parameters.
