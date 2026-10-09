# 02a — Bitcoin wallets

- **Phase:** V0a — What do I own
- **Status:** Ready
- **Depends on:** [01a Wallets](01a-wallets-and-market-data.md), [02](02-venue-balances.md) (coin grouping)
- **Written:** 2026-10-08
- **Build log:** —

## Goal

Your Xverse wallet's Bitcoin syncs like every other wallet. BTC counts in the total and groups
with WBTC under one BTC coin.

## Why

You hold BTC in Xverse, and "what do I own" isn't complete without it.

## Scope

**In**

- **Bitcoin mainnet as a chain:** CAIP-2 `bip122:000000000019d6689c085ae165831e93`, a new chain
  family `bitcoin`, and native BTC (SLIP-44 coin type 0, 8 decimals) as `…/slip44:0`.
- **Every standard address type, checksum-validated:** legacy P2PKH (`1…`), P2SH (`3…`, Xverse's
  usual payment address), native SegWit (`bc1q…`), and Taproot (`bc1p…`, Xverse's ordinals
  address). Base58check and bech32/bech32m are implemented in `packages/core` (pure, no new
  dependency), because the dashboard detects address types in the browser.
- **Unambiguous detection:** a `1…` or `3…` address uses the same characters as a Solana address.
  Detection decodes it (25 bytes with a valid checksum is Bitcoin; 32 bytes is Solana), so a pasted
  address always lands in the right family.
- **One address is one wallet** ([ADR 0016](../adr/0016-wallets.md)). Xverse's two addresses are two
  wallets; you name them, e.g. "Xverse · payment" and "Xverse · ordinals".
- **Balances** from mempool.space's public API (no key): confirmed balance = funded − spent. An
  unconfirmed change is shown as a note and isn't counted until it confirms.
- **Prices:** DefiLlama, like other native assets. BTC maps to the `btc` coin, so it groups with
  WBTC.
- **Dashboard and CLI:** "Add wallet" and `tw wallet add` recognize Bitcoin addresses. A Bitcoin
  wallet card has one "Bitcoin" section.

**Out**

- Ordinals inscriptions, Runes, and BRC-20 tokens (Taproot addresses can hold them). Their sats are
  counted as BTC, but the tokens themselves aren't read; the wallet's section says so.
- Scanning a whole wallet from its xpub (every address it ever used).
- Lightning balances.

## Approach notes

- mempool.space `GET /api/address/{address}` returns `chain_stats` and `mempool_stats`, each with
  `funded_txo_sum` and `spent_txo_sum` in sats (integers). Blockstream's Esplora serves the same API
  and is the fallback if mempool.space is down.
- Bech32 addresses are case-insensitive (stored lowercase); base58 addresses are case-sensitive
  (stored as given).
- The wallets table's family check gains `bitcoin` (a migration that widens a constraint).

## Acceptance criteria

- [ ] Each Xverse address's balance matches Xverse (and mempool.space).
- [ ] All four address types are accepted; a typo (bad checksum) is rejected with a clear message.
- [ ] A Bitcoin `1…` or `3…` address is never detected as Solana, and Solana addresses still are.
- [ ] BTC appears in the total and in the BTC coin alongside WBTC.
- [ ] Tests use public, well-known addresses only.

## Open questions

- None. Xverse's addresses are added from the dashboard ("Add wallet") once this step is built.
