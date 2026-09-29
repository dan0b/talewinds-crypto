# 08 — Transfers, bridges & reconciliation

- **Phase:** V1 — Trust the numbers, deepen research
- **Status:** Planned
- **Depends on:** [06 Ledger foundation](06-ledger-foundation.md),
  [07 On-chain trade decoding](07-onchain-trade-decoding.md)
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Moving funds between your own accounts never breaks cost basis, and every owned account provably
reconciles, or shows exactly why it doesn't.

## Why

You routinely bridge ETH from Ethereum to Robinhood Chain and move funds between Coinbase and your
wallets. Without this step, cost basis breaks on the first move
([ADR 0002](../adr/0002-ledger-truth-and-reconciliation.md)).

## Scope

**In**

- **Ethereum mainnet** transfer history (native and tokens).
- **Bridge detection:** the canonical bridge between Ethereum and Robinhood Chain, plus any
  third-party bridges you've used.
- **Cross-source matching:** Coinbase withdrawals matched to on-chain deposits (and the reverse),
  by transaction hash where available, otherwise by amount within a time window.
- **`internal_move` events** that carry lots and cost basis across accounts.
- **Rewards and airdrops** classification; spam tokens excluded from reconciliation noise.
- **Reconciliation job:** per account and asset, compare the event-derived balance with the
  observed balance. An exceptions view with drill-down, and manual resolution with an audit trail.

## Acceptance criteria

- [ ] Every owned account reconciles, or its exceptions are listed with an explanation.
- [ ] Bridged ETH keeps its original cost basis in P&L.
- [ ] A deliberately injected mismatch is detected and shown.
