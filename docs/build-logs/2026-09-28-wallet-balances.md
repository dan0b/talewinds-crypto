# Build log — 01 Wallet balances

- **Date:** 2026-09-28
- **Brief:** [`01-wallet-balances`](../briefs/01-wallet-balances.md)
- **Branch:** `v0a-what-do-i-own`

## Summary

Owned wallets on Ethereum, Robinhood Chain, and Solana now sync on a schedule and on demand. The
Portfolio page shows current holdings and USD values, with the source and age of every number,
verified-only totals, hidden-asset estimates, and clear notices for anything incomplete. One piece
is waiting on you: **Robinhood Chain token balances need a free Alchemy API key.** The chain's
official explorer blocks scripts, so until then those wallets show native ETH only and are marked
incomplete.

## What was built

**Data model** (migrations `0001`–`0003`)
- `raw_records`: provider responses as received, deduplicated by a sha256 `dedupe_key`.
  Insert-only, **enforced by a database trigger** (migration `0002`).
- `assets` (CAIP-19 identity, sanitized metadata, decimals with their source, `status` and
  `status_source`) plus `asset_status_history`.
- `sync_runs` (`running` / `succeeded` / `partial` / `failed`, with notes and request counts),
  `balance_snapshots` (each linked to its raw record), `price_observations`.

**`packages/sources`** (new): a `ProviderClient` with rate limiting, retry and backoff, timeouts,
Zod validation, request metering, and exact big-integer JSON parsing. Adapters:
- EVM: RPC native balance, plus Blockscout (Ethereum) or Alchemy (Robinhood Chain) token discovery,
  plus an RPC `decimals()` fallback.
- Solana: RPC for SOL and Token/Token-2022 accounts, plus Jupiter metadata and verification.
- Prices: DefiLlama primary, DexScreener as a capped fallback.

**`packages/portfolio`** (new): `syncAccountBalances` and `syncAllOwnedWallets` (one transaction
per account; failures are recorded, not thrown), `refreshPrices` (priority ordering, automatic
verification, miss cooldown), `buildHoldingsView`/`getHoldings`, and `setAssetStatus`.

**Apps**
- Worker: `portfolio.syncAll` on a cron (`PORTFOLIO_SYNC_MINUTES`, default 15), using a `stately`
  queue so repeated requests don't pile up. Interrupted runs are cleaned up on start.
- API: `GET /portfolio/holdings?hidden=1`, `POST /portfolio/sync`, `PUT /assets/:id/status`,
  `GET /system/sources`.
- CLI: `tw sync [--account]`, `tw holdings [--all]`, `tw asset status`.
- Dashboard: the Portfolio page (total, stat tiles, notices, a holdings table with expandable
  per-account breakdowns and verify/spam actions, an accounts list with sync status) and a
  **Data sources** card on the System page.

**Docs:** [ADR 0014](../adr/0014-asset-verification.md) (asset verification), new glossary terms,
and updated `CLAUDE.md` rules for `sources`, `db`, `portfolio`, `web`, `worker`, `cli`, and root.

## Deviations from the brief

1. **Robinhood Chain token discovery uses Alchemy, not Blockscout.** The official Blockscout
   explorer sits behind a Cloudflare bot challenge. This was decided before building and recorded
   in the brief's Decisions section.
2. **"Decimals always read from chain" became "decimals from chain data".** Blockscout, Alchemy,
   and Solana's parsed accounts all read decimals from the contract or mint. We call `decimals()`
   directly only when the indexer lacks them, and skip (with a note) tokens that have none.
3. **Added:** the `/system/sources` route and the Data sources card (so the missing key is visible
   outside the Portfolio page), `partial` sync status, and probable-NFT skipping on Solana (0
   decimals, balance 1, noted).
4. **shadcn/ui is still deferred.** Plain Tailwind primitives covered everything; nothing needed
   menus or dialogs.
5. `Note` moved into `core`; `describeError` lives in `db` so every app can use it.

## Bugs found and fixed while building

1. **Price refresh failed: `index row size 2712 exceeds btree version 4 maximum 2704`.** The dedupe
   index covered the raw request key, and batched DefiLlama requests produce keys of about 2.7 KB.
   Fixed with a hashed `dedupe_key` (migration `0003`). The backfill briefly disables the
   insert-only trigger inside the migration; all 19 existing rows were verified to match the
   TypeScript hash. There's now a regression test.
2. **Error messages leaked whole queries.** Drizzle's "Failed query: …" error embedded 37 KB of SQL
   and parameters in logs and in the CLI. `describeError` now reports the underlying database
   error.
3. **Blockscout timeouts on heavily airdropped wallets** (a multi-MB response exceeded 20s). Its
   client now has a 90s timeout.

## Verification performed

- `pnpm check` green: Biome (145 files), boundaries, typecheck (12 packages), **52 unit tests**,
  **14 integration tests** against `talewinds_test`.
- **Live smoke test on all three chains** against real providers (public addresses of well-known
  entities).
- **Spot checks against independent sources, all exact matches:**
  - Ethereum deposit contract ETH: our RPC value vs Blockscout explorer, to the wei.
  - USDT: indexer-reported vs `balanceOf` read directly from the contract.
  - Solana SOL and USDC: vs a different RPC node (publicnode).
- **Your wallets:** 4 registered wallets synced. The 2 Solana wallets completed; the 2 Robinhood
  Chain wallets are partial (native ETH only, pending the Alchemy key). I didn't compare your
  wallets against an explorer; please glance at the Portfolio page and confirm the amounts look
  right.
- **Schedule and refresh:** the worker's cron sync ran by itself. Three rapid Refresh requests
  produced one queued job and two declines (`stately` policy). The queued job ran in the worker: 4
  accounts succeeded, 3 partial, 0 failed, 80 prices updated.
- **Manual status:** spam → unverified round-trip via the API, with history recorded.
- **Dashboard:** headless screenshots of Portfolio and System with live data.
- **Test data cleanup:** three temporary `test-*` wallets were removed afterwards. Your 5 accounts
  were not touched.

## Known gaps

- **Robinhood Chain tokens: blocked on `ALCHEMY_API_KEY`.** The Alchemy adapter is built and tested
  against fixtures constructed from Alchemy's documented response shapes, **not yet against a live
  response**. First run with a key: verify, then re-record the fixtures.
- **Robinhood Chain native balances aren't independently verified** (the only reachable source is
  the official RPC we read from).
- **Valuation is at market price, not what a position could be sold for.** DefiLlama rates
  large, illiquid airdrops of real tokens as high confidence, so they can count in the total
  ([ADR 0014](../adr/0014-asset-verification.md)).
- If a token's first metadata lookup found nothing, it's never retried.
- `balance_snapshots` grows by one row per asset per account per sync. Retention and downsampling
  can come with step 09.
- The DexScreener fallback has no rotation: a wallet with more than ~90 unpriced tokens on one chain
  may leave some never tried.
- Assets, prices, and raw records from the removed test wallets remain in the dev database (raw
  records are insert-only). They're harmless and never shown.
- The public Solana RPC is tightly rate-limited. With many wallets, set `SOLANA_RPC_URL` (e.g.
  Helius's free tier).

## Next steps

1. **You:** create a free Alchemy API key, add `ALCHEMY_API_KEY=` to `.env`, and restart
   `pnpm dev`. Robinhood Chain wallets should then sync completely.
2. **Step [02 Venue balances](../briefs/02-venue-balances.md):** Hyperliquid needs nothing (public
   API by address). Coinbase needs a **view-only** API key from you. Resolve the brief's open
   question on underlying mapping before building.
