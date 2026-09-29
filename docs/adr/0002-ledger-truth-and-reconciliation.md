# 0002 — Ledger truth: one pipeline, never guess, reconcile

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

The portfolio must answer two questions for every owned account: *what do I own and what is it
worth* (balances + prices), and *how did I get here* (every transaction understood: cost basis,
P&L). Understanding transactions is the expensive part — each DEX, router, bonding curve, and
bridge needs its own decoder, and protocols change. We considered formal "fidelity levels" per
chain and rejected them as an unnecessary concept.

## Decision

- **One pipeline for every source:** source adapter → immutable raw records → normalizer
  (decoders) → chain-agnostic canonical events → portfolio engine.
- **The goal is full understanding of every source.** There are no second-class chains. Work per
  source is simply whatever the user's *actual* activity requires (e.g. Ethereum: transfers and
  bridges; Solana/Robinhood Chain: the DEXes used; Hyperliquid/Coinbase: their APIs already return
  structured fills).
- **Never guess.** A transaction the system doesn't understand becomes an explicit `unclassified`
  event, visible on the dashboard, and any P&L depending on it is marked incomplete.
- **Reconciliation proves completeness:** the balance derived from events is compared to the
  observed on-chain/venue balance. Match → ledger complete. Mismatch → the gap is shown.
- **Transfers between the user's own accounts are moves, not disposals** (see
  [0012](0012-accounts-entities-ownership.md)); otherwise cost basis breaks on the first bridge.

## Consequences

- Every number on the dashboard is either correct or visibly flagged as incomplete — never
  silently wrong.
- Canonical event types (initial set): `transfer`, `internal_move`, `trade`/`fill`, `fee`,
  `funding_payment`, `perp_open`/`perp_close`/`perp_adjust`, `reward`/`airdrop`,
  `lp_add`/`lp_remove`, `unclassified`.
- Raw records are kept forever so derived state can always be recomputed.
