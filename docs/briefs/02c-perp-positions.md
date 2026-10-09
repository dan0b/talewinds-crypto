# 02c — Perp positions

- **Phase:** V0a — What do I own
- **Status:** Planned (build when you trade perps; decided 2026-10-08)
- **Depends on:** [02 Venue balances](02-venue-balances.md)
- **Written:** 2026-10-08 (split out of step 02)
- **Build log:** —

## Goal

Open perp positions on Hyperliquid are listed with size, side, entry, mark, unrealized P&L, margin,
leverage, and liquidation price, next to the account they belong to.

## Why

Step 02 already counts the perps account's value (margin plus unrealized P&L) in the total, and
says so in a note. What's missing is the positions themselves. You have none today, so this waits
until you trade perps.

## Scope

**In**

- `position_snapshots` (account, market, side, size, entry price, mark price, unrealized P&L,
  margin used, leverage, liquidation price, observed at, raw record), written in the same
  transaction as the balances.
- The Hyperliquid adapter returns positions from `clearinghouseState.assetPositions`.
- Dashboard: a positions panel on the Hyperliquid card, with an empty state.
- The total stays equity. Notional exposure is for the risk view (09).

**Out**

- Fills, trade history, and funding payments (06).

## Acceptance criteria

- [ ] An open position's size, entry, and unrealized P&L match the Hyperliquid UI.
- [ ] The total doesn't change when positions are listed (no double counting).
