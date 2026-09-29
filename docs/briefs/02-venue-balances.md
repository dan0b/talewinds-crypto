# 02 — Venue balances & positions: Hyperliquid, Coinbase

- **Phase:** V0a — What do I own
- **Status:** Ready
- **Depends on:** [01 Wallet balances](01-wallet-balances.md)
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Hyperliquid and Coinbase appear alongside the wallets, so the portfolio total covers all five
sources, including Hyperliquid collateral, spot balances, and any open perp positions.

## Why

This completes "what do I own." Perps also introduce a new shape (a position is not a balance),
which is cheaper to model now than to retrofit.

## Scope

**In**

- **Venue asset identity** (an open question in [VISION.md](../VISION.md)): venue-scoped asset IDs,
  mapped to canonical assets where one exists, plus an **underlying** grouping. For example, ETH on
  Ethereum, ETH on Robinhood Chain, ETH at Coinbase, and an ETH perp all count toward "ETH
  exposure." Record the decision as an ADR.
- **Hyperliquid adapter:** reads by account address from the public info API: perp account state
  (account value, margin, withdrawable, positions) and spot balances. No API key is needed for
  reads.
- **Positions model:** `position_snapshots` (account, market, side, size, entry price, mark price,
  unrealized P&L, margin used, leverage, liquidation price, observed_at).
- **Coinbase adapter:** balances across Coinbase accounts, using a **view-only API key** from env.
- **Dashboard:** venue holdings in the same holdings table; a positions panel (with an empty state
  when there are none, which is your situation today); totals that never double-count.

**Out**

- Fills, trade history, and funding-payment history (06).

## Approach notes

- **No double counting:** Hyperliquid's account value already includes unrealized P&L, and perp
  **notional** is exposure, not equity. The total shows equity; the exposure views in 09 use
  notional.
- Verify the current Coinbase API (Advanced Trade / CDP keys) and its auth scheme at build time.
  Create the key with view permission only.

## Acceptance criteria

- [ ] Hyperliquid account value, withdrawable balance, and spot balances match the Hyperliquid UI.
      If a perp position is opened for testing, its size, entry, and unrealized P&L match too.
- [ ] Coinbase balances match the Coinbase UI.
- [ ] The portfolio total equals wallets plus venues, with no double counting.
- [ ] The Coinbase key is view-only: verified through the API if possible, otherwise documented as
      a manual check.
- [ ] ETH held across chains and venues can be viewed as one underlying.

## Open questions

- Is the underlying mapping curated by hand, derived from a provider (e.g. CoinGecko IDs), or both?
