# 0015 — Pricing: on-chain markets first, cross-checked

- **Status:** Accepted (amends the verification rule of [0014](0014-asset-verification.md))
- **Date:** 2026-09-29

## Context

Step 01 made DefiLlama the primary price source. On real holdings it priced moin, a two-day-old
pump.fun token, at **$0.0204 with 0.99 confidence**, while Jupiter and the token's only pool
(PumpSwap) both said **$0.000202**. DefiLlama was about 100× off, most likely because it matched a
different "MOIN". A $34 position showed as ~$3,445. An aggregator's confidence score says nothing
about whether it matched the right market for a long-tail token.

## Decision

- **Tokens are priced from the market where they actually trade:**
  - Solana: Jupiter (it aggregates on-chain pools).
  - EVM: the deepest DexScreener pool where the token is the base asset.
  These sources also provide **market cap, FDV, and liquidity**, stored with the price.
- **DefiLlama prices native assets** (ETH, SOL, with market cap from its `/mcaps` endpoint) and
  **cross-checks every token.** If the on-chain and DefiLlama prices differ by more than **25%**,
  the on-chain price is used, confidence becomes **low**, and the disagreement is stored and
  shown.
- **A token with no on-chain market** falls back to DefiLlama. If the on-chain check was skipped
  by a request cap, that fallback is low confidence.
- **Confidence:** high only with a deep market (≥ $50K liquidity) and no disagreement.
- **Thin liquidity:** a position worth more than **10%** of its pool's liquidity is flagged as
  illiquid and counted with low-confidence value, since selling it would move the price a lot.
- **Automatic verification (amends 0014):** only when DefiLlama's high-confidence price
  **agrees** with the on-chain market. A pool price alone still never verifies.

## Consequences

- Long-tail holdings reflect their real market. Disagreements are visible instead of silently
  resolved either way.
- Pricing uses three providers per refresh (DefiLlama, Jupiter, DexScreener), each capped per
  refresh.
- Thresholds (25%, $50K, 10%) are starting values to tune with real use.
- Assets auto-verified under the old rule stay verified (manual review is available); the new rule
  applies from now on.
