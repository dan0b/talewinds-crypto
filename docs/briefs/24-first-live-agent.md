# 24 — First live agent

- **Phase:** Priority 2 — Agentic trading
- **Status:** Draft
- **Depends on:** [23 Executor & hot wallets](23-executor-and-hot-wallets.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

One strategy trading live at small size, end to end.

## Scope

- Choose the strategy from the backtest and paper results (22).
- An agent runtime (in the worker or its own app) that uses `decide` for fast decisions: Jev if it
  has been evaluated and qualifies (25), Claude otherwise.
- **Monitoring:** positions, P&L, each decision with its reasoning, and limit usage.
- P&L attributed in the ledger; alerts via 15.
- **Graduated rollout:** size caps rise only after a stated number of days within limits.

## Acceptance criteria

- [ ] The agent runs for the agreed period without breaching limits.
- [ ] Every trade is traceable: decision → intent → execution → ledger.
