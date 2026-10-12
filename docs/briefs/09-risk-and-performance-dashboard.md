# 09 — Risk & performance dashboard

- **Phase:** V1 — Trust the numbers, deepen research
- **Status:** Planned
- **Depends on:** [06](06-ledger-foundation.md), [07](07-onchain-trade-decoding.md),
  [08](08-transfers-bridges-reconciliation.md) (and [02f](02f-value-over-time.md))
- **Written:** 2026-09-27
- **Build log:** —

## Goal

The dashboard answers "Where is my risk?" and "What changed?" at a glance, and shows how the
portfolio has performed over time.

## Scope

**In**

- P&L over time. (Value over time already exists: step [02f](02f-value-over-time.md) replays it
  from stored syncs and prices, [ADR 0021](../adr/0021-value-history-replayed.md). Build P&L the same
  way, from the ledger, rather than as stored daily snapshots.)
- Exposure by underlying, chain, venue, and account, with concentration warnings at configurable
  thresholds.
- Perp exposure by notional, shown alongside equity.
- A "what changed" feed: recent on-chain and venue activity, material price moves, failed or stale
  syncs.
- Drill-down from any P&L number to its events and raw transactions.
- A data-quality banner: incomplete P&L, stale prices, unreconciled accounts.
- Chart conventions for the project (color, formatting, light/dark), set up here and reused later.

## Acceptance criteria

- [ ] One screen answers: what do I own, where is my risk, and what changed.
- [ ] Every chart value is traceable to its underlying data.
- [ ] Incomplete or stale data is visibly flagged, never smoothed over.
