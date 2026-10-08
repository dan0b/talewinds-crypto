# 0014 — Asset verification: what counts in totals

- **Status:** Accepted (verification rule amended by [0015](0015-pricing-on-chain-first.md))
- **Date:** 2026-09-28

## Context

Wallets accumulate airdropped tokens, most of them spam, some with fake prices. Provider flags
don't separate them. Blockscout marked all 6,794 ERC-20s in a heavily airdropped test wallet
`reputation: ok`. DexScreener prices any token that has a pool, scams included. If totals counted
everything that has a price, they would be inflated by junk.

## Decision

Every asset has a `status`:

| Status | Meaning | Shown by default | Counted in totals |
|---|---|---|---|
| `verified` | We have a reason to believe it's real | yes | yes, if priced |
| `unverified` | Unknown | no (behind a toggle) | no; shown as a separate estimate |
| `spam` | Marked spam by you | no | no |

**Automatic verification** happens when an asset is:
- a chain's native asset (ETH, SOL);
- verified by its metadata provider (Jupiter's `isVerified` on Solana); or
- priced by DefiLlama with high confidence (DefiLlama's score ≥ 0.9).

DexScreener prices **never** verify an asset on their own.

**Manual decisions win.** Marking an asset verified, unverified, or spam sets
`status_source = manual`, and automatic rules never override it afterwards. Every change is kept
in `asset_status_history`.

Hidden assets are never dropped. The dashboard reports how many are hidden and the estimated value
of the unverified ones, separate from the total.

## Consequences

- A real but obscure token (e.g. a Robinhood Chain low cap that DefiLlama doesn't list) starts out
  hidden. You mark it verified once and it counts from then on. This is deliberate: a wrong number
  in the total is worse than one click.
- **Valuation is at market price, not liquidation value.** DefiLlama rates prices for airdropped
  marketing tokens as high confidence (e.g. 10B units of a real token at its market price), so a
  large, illiquid airdrop can appear as significant value. Valuing a position at what it could
  actually be sold for, given pool depth, is future work. Until then, the low-confidence share of
  the total is shown separately.
