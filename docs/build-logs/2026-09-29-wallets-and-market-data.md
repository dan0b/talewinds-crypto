# Build log — 01a Wallets, market data, and price accuracy

- **Date:** 2026-09-29
- **Brief:** [`01a-wallets-and-market-data`](../briefs/01a-wallets-and-market-data.md)
- **Branch:** `v0a-what-do-i-own`

## Summary

Your moin position now shows its real value (**~$33, not ~$3,445**). Prices for tokens come from
the markets they trade on, and a disagreeing source is flagged instead of trusted. Every holding
shows market cap, FDV, and liquidity. Wallets are first-class: add and name them in the dashboard,
and holdings are grouped **wallet → chain**. Robinhood Chain syncs no longer fail when Alchemy
refuses; they're partial, with Alchemy's own explanation. Its current explanation is that the
Robinhood Chain network isn't enabled in your Alchemy app.

## What was built

- **Pricing policy** ([ADR 0015](../adr/0015-pricing-on-chain-first.md)):
  - Tokens are priced by Jupiter (Solana) or the deepest DexScreener pool (EVM).
  - DefiLlama prices natives and cross-checks tokens; a gap over 25% means low confidence plus a
    stored disagreement.
  - Automatic verification needs agreement.
  - Positions worth more than 10% of pool liquidity are flagged "thin liquidity".
- **Market data:** `market_cap_usd`, `fdv_usd`, `liquidity_usd`, and cross-check columns on
  `price_observations`. Native market caps come from DefiLlama `/mcaps`. The dashboard shows a
  Market cap column (FDV and liquidity underneath).
- **Wallets** ([ADR 0016](../adr/0016-wallets.md)):
  - A `wallets` table, with `accounts.wallet_id` required for wallet accounts.
  - Migration `0004` backfilled your four wallets from their labels. It was rehearsed on a copy of
    the dev database first.
  - `addWallet` (every chain of the family by default; idempotent) and `renameWallet` capabilities.
  - `POST /api/wallets`, which queues a sync; `PATCH /api/wallets/:id`.
  - `tw wallet add | rename | list`.
- **Dashboard:**
  - An **Add wallet** form that detects the family from the address and offers chain checkboxes.
  - The **By wallet** view: wallet cards with inline Rename, "Not tracked on Ethereum · Track",
    chain sections with sync status and notes, and positions.
  - The **By asset** view, now with Market cap.
  - New notices for source disagreements and thin liquidity; a Venues card.
- **Robustness:**
  - Native balances no longer go through Alchemy.
  - A token-discovery provider error makes a sync partial, not failed.
  - Provider error text is kept (scrubbed of secrets by `redact`), so notes explain *why*.
- **Coinbase prep:** `COINBASE_API_KEY_NAME` and `COINBASE_API_PRIVATE_KEY` are validated (CDP
  name format; an ECDSA PEM, with Ed25519 rejected with an explanation). Setting only one of them
  fails at startup. The System page shows whether a key is detected. The adapter is step 02.

## Root causes found

1. **moin mispricing:** DefiLlama returned $0.0204 (confidence 0.99) for a pump.fun token whose
   only market traded at $0.000202, about 100× off. It was recorded as a regression fixture
   (`jupiter-search-market.json`, `defillama-moin-disagreement.json`).
2. **Robinhood syncs failing with a key set:** Alchemy answered `403 ROBINHOOD_MAINNET is not
   enabled for this app`. Our client discarded the body ("HTTP 403"), and because native balances
   also used Alchemy, everything failed. Both are fixed; the network toggle is on your side.

## Deviations from the brief

- None in scope. The existing single-chain EVM wallets were **not** auto-extended to Ethereum;
  instead the dashboard offers "Track", so your data only changes when you choose.

## Verification performed

- `pnpm check` green: Biome (157 files), boundaries, typecheck (12 packages), **70 unit tests**,
  **18 integration tests**. That includes regressions for moin and for the Alchemy 403 case (which
  also asserts the key never appears in notes), plus wallet, grouping, liquidity, and disagreement
  tests.
- **Live on your data:** moin is now priced by Jupiter at $0.000194, flagged "sources disagree"
  (DefiLlama still $0.0204), market cap $188K, liquidity $35.6K, value $32.81 across your two
  Solana wallets. ETH and SOL show market caps ($325B, $69B). Robinhood wallets are partial, with
  Alchemy's message and link.
- **Wallet flow, through the same API the form uses,** on a temporary `test-wallet` (a public
  contract address):
  - Added on both EVM chains (201).
  - Re-adding was a no-op that kept the name.
  - A junk address returned a readable 400.
  - Rename worked.
  - The queued sync ran in the worker: Ethereum succeeded, Robinhood partial.
  - The test wallet was then deleted by exact ID. Your four wallets are untouched.
- **Migration `0004`:** backed up the dev database, restored it into a scratch database, migrated
  it, and inspected the result (4 wallets, 0 unlinked accounts) before applying it for real. The
  backup stays in the session scratchpad.
- **Headless screenshot** of the By wallet view with live data (found and fixed a stray separator
  and a pluralization bug).

## Known gaps

- **Robinhood Chain tokens** still need the network enabled in your Alchemy app. Then verify them,
  and re-record the Alchemy fixtures from a live response.
- **Not clicked in a real browser:** the Add wallet form, inline Rename, the Track button, and the
  By asset toggle. They typecheck against the API, and their API paths were exercised, but please
  click through once.
- Tokens priced only by DefiLlama (no on-chain market) show no market cap.
- DexScreener's market cap for a wrapped token is the wrapper's own supply (WETH shows $5.5B, not
  ETH's $325B).
- Assets auto-verified under the old rule stay verified. The new rule applies going forward.
- Thresholds (25% disagreement, $50K deep market, 10% of liquidity) are first guesses.
- Removing a wallet isn't available yet.

## Next steps

1. **You:** enable Robinhood Chain Mainnet in your Alchemy app, and create the Coinbase view-only key
   (instructions in chat and in `.env.example`).
2. **Step [02 Venue balances](../briefs/02-venue-balances.md):** Hyperliquid, then Coinbase once
   the key is in `.env`.
