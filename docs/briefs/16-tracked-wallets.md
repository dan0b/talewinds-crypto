# 16 — Tracked wallets & live feeds

- **Phase:** V2 — Always on, always aware
- **Status:** Draft
- **Depends on:** [04](04-insider-analysis-solana.md), [07](07-onchain-trade-decoding.md),
  [12](12-deploy.md), [15](15-alerts-and-telegram.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

Follow KOLs and smart-money wallets and see what they buy in near real time
([ADR 0012](../adr/0012-accounts-entities-ownership.md)).

## Scope

- **Manage tracked accounts:** add, label, group into entities, and link a KOL's X handle.
- **Push ingestion** into the same raw-records pipeline (e.g. provider webhooks for Solana; webhooks
  or fast polling for EVM).
- **Reuse the swap decoders from 07.** No second ingestion path.
- An activity feed on the dashboard, and buy alerts through 15.

## Acceptance criteria

- [ ] A tracked wallet's buy appears in the feed and as an alert within a stated delay.
- [ ] Tracked wallets use the same decoders as owned wallets.
