# 01 — Wallet balances: Ethereum, Robinhood Chain, Solana

- **Phase:** V0a — What do I own
- **Status:** Ready
- **Depends on:** [00 Scaffold](00-scaffold.md)
- **Written:** 2026-09-27
- **Build log:** —

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

- **Candidate providers** (verify free-tier limits at build time):
  - Robinhood Chain: its official explorer is Blockscout (`robinhoodchain.blockscout.com`), whose
    API can list an address's token balances.
  - Ethereum: an Etherscan-family API or Alchemy's free tier.
  - Solana: Helius free tier or public RPC.
  - Prices: CoinGecko Demo, DexScreener, GeckoTerminal, or Jupiter (Solana).
- An asset with no price shows as **"no price"**, not $0. Its value is left out of totals, with a
  visible note saying so.
- Spam airdrops are common on both chain families. Start with a simple rule (no price and not
  verified ⇒ `unverified`, hidden by default) plus a manual "mark as spam" that keeps history.

## Acceptance criteria

- [ ] After registering real wallets on all three chains and running `pnpm tw sync`, balances
      match the block explorers (spot-checked) and show USD values.
- [ ] Every balance and price shows its source and age; data older than the staleness threshold is
      visibly flagged.
- [ ] Unpriced and unverified tokens are visible via the toggle. They are never silently dropped
      and never shown as $0.
- [ ] Every balance snapshot links to the raw record it came from.
- [ ] Syncs respect provider rate limits, and adapter tests run from recorded fixtures, not live
      calls.
- [ ] Integration tests for repos and capabilities run against the test database.

## Open questions

- Which ERC-20 discovery provider for Ethereum on a free tier? Does Blockscout's API cover
  Robinhood Chain adequately?
- Default sync interval given free-tier limits (proposal: 15 minutes).
- Should integration tests run inside `pnpm check` (which would require Docker to be running) or as
  a separate `pnpm test:db`?
