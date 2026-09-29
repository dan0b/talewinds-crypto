# 07 — On-chain trade decoding: Solana + Robinhood Chain

- **Phase:** V1 — Trust the numbers, deepen research
- **Status:** Planned
- **Depends on:** [01 Wallet balances](01-wallet-balances.md),
  [06 Ledger foundation](06-ledger-foundation.md)
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Your swaps on Solana and Robinhood Chain become canonical trade events, priced at execution time,
flowing into the same cost-basis engine as venue fills.

## Why

Most of your trading happens on-chain. This is the expensive part of the ledger
([ADR 0002](../adr/0002-ledger-truth-and-reconciliation.md)): every protocol needs its own decoder.

## Scope

**In**

- **Protocol inventory first:** scan your actual history and list the DEXes, aggregators, and
  launchpads you've used. Decoders are built only for those, largest value first.
- **Transaction history ingestion** per owned wallet (parsed transactions on Solana; logs and
  traces via explorer or RPC on Robinhood Chain), stored as raw records.
- **Decoders** that produce `trade` events, along with `fee` and `unclassified`.
- **Execution-time pricing:** price derived from the swap itself, i.e. the counter-leg (SOL, ETH,
  USDC) times that asset's USD price at that moment.
- **Coverage report:** the share of swap value decoded vs `unclassified`, plus a queue of
  unclassified transactions sorted by value.

**Out**

- Transfers, bridges, and reconciliation (08).

## Acceptance criteria

- [ ] A coverage report shows what share of historical swap value is decoded. The target is set
      after the inventory.
- [ ] Spot-checked trades match the explorer (amounts, price, fees).
- [ ] Nothing undecodable is dropped; it all lands in the unclassified queue.

## Open questions

- A free source of historical SOL/ETH prices at minute granularity.
