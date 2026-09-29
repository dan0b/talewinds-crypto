# 0012 — Accounts, entities, and ownership

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

Wallet tracking and on-chain investigation mean the database will hold many addresses that aren't
the user's. If the schema assumed "every account is mine," adding tracked wallets later would mean
untangling every portfolio query.

## Decision

- **Every wallet address or venue account is an `Account`** with an `ownership`:
  - `owned` — the user's. Feeds portfolio, cost basis, P&L, reconciliation (accounting-grade).
  - `tracked` — someone else's, deliberately followed (KOL, profitable wallet, insider). Gets
    behavior analytics (analytics-grade).
  - `observed` — seen during analysis, never deliberately followed. Stored lightly.
- **One ingestion pipeline for all of them.** The same decoders serve every ownership; only the
  downstream calculations differ.
- **`Entity`** groups accounts controlled by one person or group. All owned accounts belong to the
  single `self` entity (enforced by a unique partial index). A bundler cluster or a KOL (with
  their X handle) is another entity.
- **Labels are data, not truth.** "Insider", "sniper", "deployer", "CEX hot wallet" each carry a
  source (manual / heuristic / `decide`), a confidence, and a timestamp, and can be revised with
  history. (Labels table arrives with investigation work.)

## Tracked-wallet analytics (what the user wants, V2)

- **KOL wallets:** a feed of what they're buying.
- **Profitable wallets:** a strategy breakdown — every round trip, entry timing relative to token
  launch, hold time, win rate, typical multiple.
- **Big holders of a token:** a per-token view of top holders, their labels, and recent activity,
  with suspicious patterns flagged.
- Approximate is acceptable here and is labeled as such; full portfolio/P&L of others is not a
  goal.

## Consequences

- Timeliness matters for KOL buys, so ingestion accepts both **pull** (scheduled sync) and **push**
  (webhooks/streams) into the same raw-records table. V0 is pull-only.
- The same EVM address on two chains is two accounts (per CAIP-10), linked through one entity.
