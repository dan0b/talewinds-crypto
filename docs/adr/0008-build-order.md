# 0008 — Build order: thin slices of both priority-1 halves

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

The brief sequenced a full ledger (V0–V1) before any research (V2). The user treats research
automation and portfolio management as one priority.

## Decision

1. **Scaffold** — infrastructure only (done 2026-09-27; see
   [build log](../build-logs/2026-09-27-scaffold.md)).
2. **V0a — What do I own:** current balances and values across all five sources (Ethereum,
   Solana, Robinhood Chain, Hyperliquid, Coinbase) on the dashboard. Balances only; no trade
   history yet.
3. **V0b — Contract address → research report:** a minimal but real pipeline. Paste an address, a
   job runs, a structured report appears on the dashboard. Solana first (see
   [0011](0011-research-scope.md)).
4. **V1:** full trade history, cost basis, P&L, and reconciliation, alongside a deeper research
   pipeline.

## Consequences

- Each half exercises the entire architecture (adapter → DB → API → dashboard; job → worker → LLM
  → structured storage → dashboard), proving the scaffold end to end early.
- Useful output from both priorities within weeks, instead of months on the ledger first.
