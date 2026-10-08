# 01 — Wallet balances: Ethereum, Robinhood Chain, Solana

- **Phase:** V0a — What do I own
- **Status:** ✅ Done (follow-up: verify Robinhood Chain tokens once an Alchemy key is set)
- **Depends on:** [00 Scaffold](00-scaffold.md)
- **Written:** 2026-09-27
- **Build log:** [`2026-09-28-wallet-balances`](../build-logs/2026-09-28-wallet-balances.md)

## Goal

The Portfolio page shows what every owned wallet on Ethereum, Robinhood Chain, and Solana holds
right now and what it's worth. Balances refresh on a schedule, and the source and age of every
number are visible.

## Why

"What do I own?" is the first question the dashboard has to answer. This is also the first real
data through the whole pipeline — source adapter → immutable raw records → normalized data →
capability → API → dashboard — so it proves the path every later step reuses.

## Scope

**In**

- **Tables**
  - `raw_records`: provider, request key, fetched_at, payload, content hash. Insert-only.
  - `assets`: CAIP-19 ID, chain, contract/mint, symbol, name, decimals, metadata source,
    `unverified` / `spam` flags.
  - `balance_snapshots`: account, asset, raw amount (`numeric(78,0)`), observed_at, link to the
    raw record.
  - `price_observations`: asset, USD price, source, observed_at.
- **Shared adapter plumbing** in `packages/sources`: rate limiting, response caching, retry with
  backoff, raw-record capture, request counting (feeds cost tracking later).
- **EVM adapter** (one adapter, configured per chain): native balance via JSON-RPC; ERC-20 holdings
  discovery via an explorer or indexer API, because RPC alone can't list which tokens a wallet
  holds.
- **Solana adapter:** SOL balance plus SPL token accounts under both the Token and Token-2022
  programs.
- **Token metadata:** decimals always read from chain; symbol and name from chain or provider,
  with the source recorded.
- **Prices:** at least one free source per chain family; every observation carries its source and
  timestamp.
- **Sync:** a `portfolio.syncBalances` job per owned wallet, on a schedule and on demand
  (`pnpm tw sync`, plus a refresh button on the dashboard).
- **Capability:** `getHoldings()` returns per-asset totals with a per-account breakdown, value,
  balance age, and price age.
- **Dashboard:** total value; holdings grouped by asset with an expandable per-account breakdown;
  chain badges; stale and unpriced indicators; unverified tokens hidden behind a toggle, never
  dropped.
- **Test-database strategy:** decide and implement. Recommendation: a separate `talewinds_test`
  database in the same container, migrated before integration tests.

**Out**

- Venues (02); trade history, cost basis, and P&L (06+); DeFi and LP positions; historical balance
  charts (09).

## Approach notes

- **Providers** (tested live on 2026-09-28; see Decisions below).
- An asset with no price shows as **"no price"**, not $0. Its value is left out of totals, with a
  visible note saying so.
- **Spam handling.** Provider reputation flags don't discriminate (Blockscout marked all 6,794
  ERC-20s in a heavily airdropped test wallet `ok`), so verification is our own rule: an asset is
  `verified` if it's a chain's native asset, DefiLlama prices it with high confidence, Jupiter marks
  it verified (Solana), or you mark it verified. Everything else is `unverified` and hidden by
  default (the toggle shows it). Manual "mark as spam" / "mark as verified" overrides keep history.
- **Totals** include visible (verified) priced assets only. Hidden assets are counted in a note
  ("N unverified tokens hidden, ≈ $X") rather than inflating the total.
- **Decimals** come from chain data: either read directly via RPC, or taken from an indexer that
  reads them from the contract (Blockscout, Alchemy, Solana parsed accounts). The source is
  recorded. A token with no readable decimals is skipped and recorded as a gap in the sync run.
- **Token metadata is untrusted input.** One live Robinhood Chain token has a symbol thousands of
  characters long. Symbols and names are length-capped and stripped of control characters before
  storage, and are never interpreted as anything but display text.
- **A sync that couldn't see everything is `partial`, not `succeeded`** (e.g. Robinhood Chain
  without an Alchemy key: native ETH only). The dashboard shows partial accounts as incomplete.

## Acceptance criteria

- [x] After registering real wallets on all three chains and running `pnpm tw sync`, balances
      match the block explorers (spot-checked) and show USD values. *Ethereum and Solana verified
      exactly against independent sources; Robinhood Chain native ETH works, and its tokens await an
      Alchemy key (see build log).*
- [x] Every balance and price shows its source and age; data older than the staleness threshold is
      visibly flagged.
- [x] Unpriced and unverified tokens are visible via the toggle. They are never silently dropped
      and never shown as $0.
- [x] Every balance snapshot links to the raw record it came from.
- [x] Syncs respect provider rate limits, and adapter tests run from recorded fixtures, not live
      calls.
- [x] Integration tests for repos and capabilities run against the test database.

## Decisions (resolved 2026-09-28, before building)

- **Providers:**

  | Need | Ethereum | Robinhood Chain | Solana |
  |---|---|---|---|
  | Native balance | Public RPC (publicnode), or Alchemy if a key is set | Robinhood public RPC (`rpc.mainnet.chain.robinhood.com`), or Alchemy if a key is set | Public RPC (`api.mainnet-beta.solana.com`), overridable, e.g. with Helius |
  | Token discovery | Blockscout API v2 (`eth.blockscout.com`, keyless) | **Alchemy Token API (free key required)**. The official explorer (Blockscout) sits behind a Cloudflare bot challenge, so it isn't usable programmatically | RPC `getTokenAccountsByOwner` (Token + Token-2022 programs) |
  | Token metadata | Blockscout (inline) | Alchemy `getTokenMetadata` | Jupiter Tokens API v2 (batch, includes verification) |
  | Prices | DefiLlama (primary, all three chains + natives), DexScreener fallback (capped) | same | same |

  Robinhood's docs recommend Alchemy as the RPC provider, and Alchemy's launch announcement lists
  its token, transfer, price, and webhook APIs on the chain. Until an Alchemy key is set, Robinhood
  Chain syncs are `partial` (native ETH only).
- **Sync interval:** 15 minutes by default, configurable. Prices refresh in the same cycle.
- **Integration tests run inside `pnpm check`**, against a separate `talewinds_test` database in
  the same container. `pnpm check` starts Postgres if needed. A check that skips tests silently
  when Docker is down would hide failures.
