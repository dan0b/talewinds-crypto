# 0018 — Venue assets: identity, amounts, and prices

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

Holdings at a venue (Coinbase today) have no chain or contract. They need an identity that never
falls back to a bare ticker ([0013](0013-chain-agnostic-identity.md)), exact amounts, and a price.
[VISION.md](../VISION.md) listed venue asset identity as an open question for V0a.

## Decision

- **Identity:** a venue-scoped ID in CAIP-19 shape. The chain part is `venue:<venue>`, and the
  asset part is `currency:<code>`, with the venue's own currency code: `venue:coinbase/currency:ETH`.
  These are stored in the same `assets` table with a new kind, `venue` (no address).
- **The code means something only inside its venue.** `venue:coinbase/currency:ETH` is ETH because
  Coinbase defines it so. It never links to an on-chain asset by ticker. Holdings in different
  places are related only through the underlying grouping ([0019](0019-underlying-grouping.md)).
- **Exact amounts:** venues report decimal strings. They're stored as integers with a fixed
  precision of 18 decimals. A value with more precision is rejected with a note, never rounded.
- **Status:** venue assets are verified. The venue vouches for what it lists, and spam airdrops
  can't land in a venue account.
- **Prices come from the venue's own market**, following [0015](0015-pricing-on-chain-first.md)'s
  "price where it trades". Coinbase uses its public `<CODE>-USD` product price. USD is the unit, so
  its price is 1. USDC at Coinbase is valued at $1, because Coinbase converts USDC and USD 1:1 and
  has no USDC-USD market; it's labeled as Coinbase's 1:1 conversion, not presented as a market
  price. A code with no USD market has no price (shown, not counted), never a guess.

## Consequences

- ETH at Coinbase and ETH on Ethereum are different assets, like ETH on two chains. "How much ETH
  do I have" is answered by the underlying grouping.
- Perpetual positions (Hyperliquid) are positions, not assets: they get the positions model in
  step 02.
- Staked funds at Coinbase appear only in the portfolio breakdown, which reports floats. Until they
  can be read exactly, they're reported as a visible gap rather than added approximately.
