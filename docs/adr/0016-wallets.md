# 0016 — Wallets group accounts by address

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

Accounts are per chain (CAIP-10), which is right for the ledger, but you think in wallets: "my
trading wallet", which on EVM is one address on every EVM chain. You asked to add and name wallets
in the dashboard and to see holdings grouped wallet → chain.

## Decision

- A **`wallets`** table: one row per (chain family, address), with an optional **name**. Wallet
  accounts link to it via `accounts.wallet_id`, and the database requires every wallet account to
  have one.
- **One EVM address is one wallet** across all EVM chains; a Solana address is one wallet on
  Solana.
- **Adding a wallet** detects the family from the address and, by default, creates an account on
  **every supported chain of that family** (deselectable). Adding a known address again is safe:
  it only adds missing chains and never renames.
- **The name lives on the wallet**, not on each chain account. Venue accounts (Coinbase,
  Hyperliquid) keep their own labels and aren't wallets.
- Existing accounts were migrated: one wallet per address, named from the oldest account's label.
- Holdings are shown **wallet → chain → positions** by default. The merged by-asset view remains.

## Consequences

- Wallets you added on one chain (via the old CLI) show the other chains of their family as "not
  tracked", with one click to track them.
- Tracked (non-owned) wallets, e.g. KOLs (step 16), fit the same model.
- Removing a wallet isn't built yet; deleting a wallet row cascades to its accounts.
