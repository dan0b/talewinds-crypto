# Build log: 02 — Venue balances: Coinbase, Hyperliquid, coin grouping

- **Date:** 2026-10-08
- **Brief:** [02-venue-balances](../briefs/02-venue-balances.md)

## Summary

Coinbase and Hyperliquid now sync alongside the wallets and count in every total. Coinbase is read
with a view-only key, and every sync first confirms with Coinbase that the key can't trade or
transfer. Hyperliquid is read by address from its public API. Holdings are grouped into
**coins**, so ETH on Ethereum and Robinhood Chain, WETH, rsETH, and ETH at Coinbase count as one ETH
in the allocation, with each holding and its form visible.

Live at the end of the step: $32,672 in total. Coinbase held $11,234 (ZEC, USDC, USD cash), and
Hyperliquid $9,503 (83.5 HYPE, 2,494.85 USDC spot). Robinhood Chain tokens also became visible
during this step, once the network was enabled in Alchemy.

## What was built

- **Decisions:** [ADR 0017](../adr/0017-view-only-venue-keys.md) (view-only venue keys may sign
  read requests, checked before every sync; Rule 1 amended),
  [ADR 0018](../adr/0018-venue-assets.md) (venue asset identity, exact amounts, venue prices), and
  [ADR 0019](../adr/0019-underlying-grouping.md) (a hand-curated coin registry).
- **Core:** the asset kind `venue` and `venueAssetRef` (`venue:coinbase/currency:ETH`); `VENUE_INFO`
  and `placeName`; `underlyingOf` with a registry that cites how each contract was verified (WETH,
  wstETH, ETHx, wBETH, rsETH, WBTC, USDC, and USDT on Ethereum; WETH on Robinhood Chain; wSOL, USDC,
  USDT, and WBTC on Solana; venue codes), with native assets mapped by SLIP-44 coin type.
- **Database:** migration `0005_venue_assets` (it widens two check constraints; no data touched),
  `ownedVenueAccounts`, and raw records now store a bare JSON `null` response as JSON null.
- **Sources:**
  - `ProviderClient` gets an `authorize` hook for per-request headers, so retries never reuse an
    expired token.
  - **Coinbase:** an ES256 JWT per request, signed with `node:crypto` from a key parsed on first use
    (the API process never loads it). It reads `key_permissions` (refusing a trade or transfer
    key), then every account page (available + hold, exact strings; vaults summed by currency), then
    the portfolio breakdown, only to detect staked funds, which are reported as a gap. Prices come
    from Coinbase's public `<CODE>-USD` markets, with Coinbase's exchange rates as the fallback
    (USDC and USD at 1).
  - **Hyperliquid:** spot balances (total, including what's on hold), plus the perps account's value
    counted as USDC (with a note), and gaps reported for vault deposits, staked HYPE, and
    sub-accounts. Prices are each token's USDC spot market mid from its order book, matched through
    the spot metadata by token index (cached for an hour), with the bid-side depth as liquidity.
    USDC is the quote currency, at 1.
  - `combineVenuePrices`: a venue whose prices fail becomes a note, and its assets aren't put on the
    24-hour price-miss cooldown.
- **Portfolio:** `syncAllOwnedAccounts` (wallets, then every venue that's set up), venue pricing in
  `refreshPrices` (each source fetched and stored on its own), venue accounts as groups with one
  section, a venue account usable as a scope, `byCoin` with its parts, and concentration by coin.
- **Dashboard:** Coinbase and Hyperliquid cards (no rename; "Not set up" with instructions until a
  key exists), the scope picker lists venues, and "By asset" in the allocation card shows coins
  that expand into their holdings. The System page explains the key check. `SyncBadge` was split
  out, and the unused venue list was removed.
- **Afterwards, from your feedback:** the hidden-tokens notice names the largest hidden tokens, and
  its button toggles between "Review" and "Hide again". V4 was marked verified at your request,
  since DefiLlama doesn't cover it, so it couldn't auto-verify.

## Deviations from the brief (and why)

1. **The perp positions model moved to its own step ([02c](../briefs/02c-perp-positions.md)).** You
   have no open perps, and you chose to build it when you trade them. Until then, perps account value
   is counted (as USDC) and flagged with a note.
2. **USDC and USD at Coinbase are priced from Coinbase's exchange rates**, because there's no
   USDC-USD market. The rate is a real Coinbase response, not a rule hard-coded here.
3. **Staked funds (Coinbase) and vaults, staking, and sub-accounts (Hyperliquid) are reported as gaps**
   rather than added. Coinbase reports staked funds only as floats. None of these exist in your
   accounts today.
4. **Coinbase fixtures are synthetic** (there's no public account to record). They were checked
   against your first live sync, which read the same shapes without errors. Hyperliquid fixtures were
   recorded from public accounts (the Assistance Fund and HLP).

## Verification performed

- **Coinbase, live:** `key_permissions` returned `can_view` true and `can_trade` and `can_transfer`
  false (default portfolio). 6 balances were read in 3 requests, and the sync completed with no gaps.
- **Hyperliquid, live:** your address is a main account (`role: user`). 2 balances were read in 5
  requests. HYPE was priced at the order-book mid ($83.93, with $236K of bid depth), matching the
  perps mid within 0.1%.
- **The first live Hyperliquid sync failed**, because `subAccounts` returns a bare `null`, which the
  raw-records insert stored as SQL NULL. That was fixed in `saveRawRecords` and covered with a
  regression test.
- **The dashboard was restarted** to load the key. Two old `pnpm dev` stacks (from 9 and 10 days ago)
  were stopped, and one fresh stack is running.
- **Checks:** `pnpm check` passes: lint, boundaries, typecheck, **109 unit tests** (from 89), and **23
  integration tests** (from 20). New tests cover JWT signing (verified with the public key), PEM
  handling, Ed25519 refusal, the key guard (no balance read after a refusal), pagination, exact
  amounts, the staked gap, Coinbase and Hyperliquid prices, venue price failures, the coin registry,
  coin grouping by value, and Coinbase end to end through sync, prices, and holdings.
- **Spot checks:** HOOKR's $0.01699 matches its deepest pool (Uniswap, $970K liquidity), and
  DefiLlama agreed. MM Acct Store's USDC on Ethereum fell by 600 and then 2,200 between syncs:
  real on-chain moves, read consistently.

## Known gaps

- **Please confirm Coinbase and Hyperliquid amounts against their apps.** These are the two
  acceptance criteria only you can check, so they're left unticked in the brief.
- Coinbase currencies outside the registry (ZEC, LINK, AKT, ADA) are their own coins. That's correct,
  but ZEC at Coinbase won't group with ZEC anywhere else until it's added.
- Hyperliquid's USDC is valued at 1, as the venue's quote currency.
- Perp positions aren't listed (see 02c).
- Tokens DefiLlama doesn't cover (most of Robinhood Chain) never auto-verify. Each needs one
  "Mark verified". The notice now names the largest hidden ones.

## Next steps

1. **[02a Bitcoin wallets](../briefs/02a-bitcoin-wallets.md):** your Xverse wallet.
2. **[02b Categories and themes](../briefs/02b-categories-and-themes.md):** tag coins and see the
   portfolio by category and theme.
3. **[02c Perp positions](../briefs/02c-perp-positions.md):** when you trade perps.
