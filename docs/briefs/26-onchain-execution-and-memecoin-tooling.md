# 26 — On-chain execution & memecoin tooling (exploratory)

- **Phase:** Priority 2 — Agentic trading
- **Status:** Draft (exploratory)
- **Depends on:** [23 Executor & hot wallets](23-executor-and-hot-wallets.md) (and
  [04](04-insider-analysis-solana.md), [16](16-tracked-wallets.md))
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

Explore trading on-chain on Solana and Robinhood Chain, and memecoin tooling. Sniping is an idea,
not a commitment.

## Scope

- **Start read-only:** a discovery feed of new launches, filtered by `quick` scans (which are
  near-free).
- **Then, if pursued:**
  - on-chain swaps through the executor (e.g. an aggregator on Solana, DEX routers on Robinhood
    Chain);
  - MEV and sandwich protection;
  - whether latency needs call for a faster language or co-location.
- Strict per-strategy budgets.

## Acceptance criteria

- To be set in a planning session. The first milestone is the read-only discovery feed.
