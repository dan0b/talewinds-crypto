# 01a — Wallets, market data, and price accuracy

- **Phase:** V0a — What do I own
- **Status:** ✅ Done (follow-up: Robinhood Chain tokens once the network is enabled in Alchemy)
- **Depends on:** [01 Wallet balances](01-wallet-balances.md)
- **Written:** 2026-09-28
- **Build log:** [`2026-09-29-wallets-and-market-data`](../build-logs/2026-09-29-wallets-and-market-data.md)

## Goal

Make the portfolio match how you think about it, and make its numbers trustworthy:

- **Wallets are first-class.** Add a wallet and name it from the dashboard. Holdings are grouped
  **wallet → chain**, with totals for each.
- **Every token shows its market cap** (and FDV).
- **Prices come from where tokens actually trade.** Your moin position showed ~$3,445; its real
  value is about $34.

## Why

Feedback on step 01:

1. **moin was overvalued ~100×.** DefiLlama priced it at $0.0204 with 0.99 "confidence", while
   Jupiter and its PumpSwap pool both said $0.000202. The token launched on pump.fun two days
   earlier; DefiLlama most likely matched it to a different "MOIN". Using DefiLlama as the primary
   price for long-tail tokens is the wrong choice.
2. Adding wallets was CLI-only. You expected to add and name them in the dashboard, and to see
   holdings per wallet rather than one merged list.
3. You want market cap per token.
4. The Alchemy key exposed a robustness gap: with the key set but Robinhood Chain not enabled in the
   Alchemy app, every Robinhood sync **failed** (even native ETH), and the error said only
   "HTTP 403".

## Scope

**In**

- **Pricing policy** (new ADR): tokens are priced from **on-chain markets first**: Jupiter for
  Solana, DexScreener (deepest pool) for EVM. **DefiLlama** prices native assets and
  **cross-checks** tokens. If the sources disagree by more than 25%, the on-chain price is used,
  confidence drops to low, and the disagreement is shown. Automatic verification from DefiLlama
  now requires agreement with the on-chain price.
- **Market data:** market cap, FDV, and pool liquidity stored with each price observation. Tokens
  get them from Jupiter/DexScreener; ETH and SOL from DefiLlama's market-cap endpoint. Shown in
  every holdings view with its source.
- **Thin-liquidity warning:** a position worth more than 10% of its pool's liquidity is flagged
  (its value probably can't be realized at that price) and counted as low confidence.
- **Wallets** (new ADR): a `wallets` table groups accounts by address. One EVM address is one
  wallet across every EVM chain; a Solana address is one wallet. Each wallet has a name. Existing
  accounts are migrated into wallets, named from their current labels.
- **Add wallet in the dashboard:** paste an address and the chain family is detected. EVM wallets
  are tracked on every supported EVM chain by default (you can deselect). Optionally name it, and
  it syncs right away. **Rename** a wallet in place. CLI parity: `tw wallet add` and
  `tw wallet rename`.
- **Holdings grouped wallet → chain** by default, with per-wallet and per-chain values and sync
  status. The merged by-asset view stays available behind a toggle.
- **Robustness:** Alchemy is used only for token discovery (native balances use the public or
  custom RPC). A token-discovery failure makes the sync **partial**, not failed, and the note
  carries the provider's own explanation, with secrets scrubbed.
- **Coinbase key prep:** `COINBASE_API_KEY_NAME` and `COINBASE_API_PRIVATE_KEY` are defined and
  validated in `.env`. The adapter that uses them comes in step 02.

**Out**

- Removing wallets (not requested yet), venue syncing (02), liquidation-based valuation beyond the
  thin-liquidity flag.

## Acceptance criteria

- [x] moin (and any token) is valued at its on-chain price; a DefiLlama disagreement is visible.
- [x] Every held token shows market cap (and FDV when it differs) with its source; ETH and SOL
      show market cap too.
- [x] Adding a wallet from the dashboard creates its accounts on every chain of its family and
      syncs them; renaming shows everywhere.
- [x] Holdings are grouped wallet → chain with per-wallet and per-chain values; the by-asset view
      still works.
- [x] With Robinhood Chain not enabled in the Alchemy app, Robinhood syncs are **partial** (native
      ETH shown), with Alchemy's explanation in the note. Once it's enabled, tokens appear.
- [x] The Coinbase variables are accepted and validated from `.env`.
- [x] `pnpm check` passes, with new unit and integration tests for pricing, market data, and
      wallets.

## Open questions

None blocking. Thresholds (25% disagreement, 10% of liquidity, $50K "deep pool") are starting
values to tune with real use.
