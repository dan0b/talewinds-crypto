# 02 — Venue balances & positions: Hyperliquid, Coinbase

- **Phase:** V0a — What do I own
- **Status:** ✅ Done (to confirm: Coinbase and Hyperliquid amounts against their apps; perp
  positions moved to [02c](02c-perp-positions.md))
- **Depends on:** [01 Wallet balances](01-wallet-balances.md)
- **Written:** 2026-09-27 (updated 2026-10-08: order, decisions, verified Coinbase API)
- **Build log:** [`2026-10-08-venue-balances`](../build-logs/2026-10-08-venue-balances.md)

## Goal

Hyperliquid and Coinbase appear alongside the wallets, so the portfolio total covers all five
sources, including Coinbase cash and Hyperliquid collateral, spot balances, and any open perp
positions. "How much ETH do I have" counts ETH wherever it sits.

## Why

This completes "what do I own." Perps also introduce a new shape (a position is not a balance),
which is cheaper to model now than to retrofit.

## Order (decided 2026-10-08)

1. **Coinbase balances**, including USD cash, with the view-only key guard.
2. **Underlying grouping**: one "ETH" across chains and venues, in the overview.
3. **Hyperliquid**: balances and perp positions.

## Scope

**In**

- **Venue asset identity** ([ADR 0018](../adr/0018-venue-assets.md)): `venue:coinbase/currency:ETH`,
  a new asset kind `venue`, amounts stored exactly at 18 decimals, and the venue's own market
  prices.
- **View-only key guard** ([ADR 0017](../adr/0017-view-only-venue-keys.md)): every Coinbase sync
  starts with `key_permissions`, and a key that can trade or transfer is refused.
- **Coinbase adapter:** every account's balance (available + on hold), crypto and fiat, across
  pages. It's synced with the wallets on the same schedule, from the same "Refresh", with the same
  raw-record provenance and sync runs.
- **Underlying grouping** ([ADR 0019](../adr/0019-underlying-grouping.md)): a hand-curated registry
  in `packages/core`. Wrapped and staked versions count toward their coin, and their form stays
  visible. Stablecoins stay separate, and unknown assets are their own coin. The overview gets a
  "By coin" allocation, and concentration counts by coin.
- **Hyperliquid adapter:** reads by account address from the public info API: perp account state
  (account value, margin, withdrawable, positions) and spot balances. No API key is needed for
  reads.
- ~~**Positions model:** `position_snapshots` (account, market, side, size, entry price, mark price,
  unrealized P&L, margin used, leverage, liquidation price, observed_at).~~ Moved to
  [02c](02c-perp-positions.md) on 2026-10-08: no open perps yet, so it's built when you trade them.
- **Dashboard:** venues sit next to wallets (Coinbase as a card like a wallet, selectable in the
  scope picker), and count in every total and allocation. A positions panel has an empty state when
  there are none. Totals never double-count.

**Out**

- Fills, trade history, and funding-payment history (06).
- Coinbase's own cost basis and P&L fields (the portfolio breakdown has them; 06 decides whether to
  use them).

## Approach notes

- **Coinbase API (verified against the docs on 2026-10-08):**
  - Auth: a JWT per request, `ES256`, with header `kid` (the key name) and a random `nonce`, and
    claims `iss: "cdp"`, `sub` (the key name), `nbf`, `exp` (+120 s), and
    `uri: "GET api.coinbase.com/<path>"` (no query string). The key must be **ECDSA**: Coinbase now
    defaults to Ed25519, which the Coinbase App API rejects.
  - `GET /api/v3/brokerage/key_permissions` returns `can_view`, `can_trade`, `can_transfer`, and
    `portfolio_uuid` (the key is tied to one portfolio).
  - `GET /api/v3/brokerage/accounts?limit=250&cursor=…` returns `accounts[]` with
    `available_balance` and `hold` (both `{value, currency}` with **exact decimal strings**),
    `type` (crypto, fiat, vault, perp futures), and `has_next`/`cursor`.
  - `GET /api/v3/brokerage/portfolios/{uuid}` (breakdown) reports positions as **floats**.
    Staked funds appear only there (`ACCOUNT_TYPE_STAKED_FUNDS`), so the first version reports
    them as a gap with their approximate value rather than adding them inexactly.
  - Prices: the public `GET /api/v3/brokerage/market/products?product_ids=ETH-USD&…` returns exact
    string prices. There's no USDC-USD market, because Coinbase converts USDC and USD 1:1.
- **No double counting:** Hyperliquid's account value already includes unrealized P&L, and perp
  **notional** is exposure, not equity. The total shows equity; the exposure views in 09 use
  notional.
- **Fixtures:** Coinbase has no public account to record from, so fixtures are synthetic, built
  from the documented shapes with made-up amounts. They're checked against one real response once
  your key exists, never copied from it.

## Acceptance criteria

- [ ] Coinbase balances (crypto and cash) match the Coinbase UI.
- [x] The Coinbase key is view-only: verified through `key_permissions` on every sync. A key that
      can trade or transfer is refused (tested). Live 2026-10-08: `can_view` true, `can_trade` and
      `can_transfer` false.
- [x] ETH held across chains and venues can be viewed as one underlying, with each form visible.
      (Live across chains; Coinbase covered by tests until the key exists.)
- [ ] Hyperliquid account value, withdrawable balance, and spot balances match the Hyperliquid UI.
      If a perp position is opened for testing, its size, entry, and unrealized P&L match too.
- [x] The portfolio total equals wallets plus venues, with no double counting. (Perps account
      value is counted once, as USDC; positions stay out of the total.)

## Open questions

- ~~Is the underlying mapping curated by hand, derived from a provider, or both?~~ Curated by hand
  ([ADR 0019](../adr/0019-underlying-grouping.md)).
- Staked funds at Coinbase: read them exactly from the breakdown's raw number text, or leave them as
  a reported gap? Decide after seeing a real response.
