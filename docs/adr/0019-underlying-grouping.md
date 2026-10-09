# 0019 — Underlying grouping: a hand-curated registry

- **Status:** Accepted
- **Date:** 2026-10-08

## Context

"How much ETH do I have?" has to count ETH on Ethereum and on Robinhood Chain, ETH at Coinbase,
and WETH, rsETH, and ETHx, as one exposure. Identity is per chain and venue
([0013](0013-chain-agnostic-identity.md), [0018](0018-venue-assets.md)), so this needs an explicit
mapping. Step 02's open question was whether that mapping is curated by hand, derived from a
provider, or both. On 2026-10-08 you chose to group wrapped and staked versions with their coin,
keep each version visible, and keep stablecoins separate.

## Decision

- **Every asset has an underlying** (`eth`, `btc`, `sol`, `usdc`, …), from a **hand-curated
  registry** in `packages/core`. Native assets map by their SLIP-44 coin type (`slip44:60` is ETH on
  every EVM chain whose gas is ETH): that's identity, not a ticker. Tokens and venue assets map by
  their exact ID.
- **Wrapped, bridged, staked, and restaked versions count toward their coin**, each tagged with its
  **form** (native, wrapped, staked, restaked, venue) so breakdowns show which is which. WETH,
  ETHx, and rsETH count as ETH; WBTC counts as BTC.
- **Stablecoins are their own underlyings** (USDC, USDT, and USD each separate). A later "cash"
  category can group them.
- **Unknown assets are their own underlying**, never matched by ticker or name. Adding an entry is
  a reviewed code change that cites how the contract was verified.
- **Not derived from a provider, for now.** CoinGecko-style IDs treat WETH and ETH as different
  coins, so they would still need curation. Revisit if a token shows up in several places that the
  registry doesn't cover.

## Consequences

- The allocation gains a by-coin view, and concentration can be measured by coin.
- A wrapped or staked version can lose its peg (rsETH isn't ETH in a crisis). Forms stay visible in
  every breakdown, and the risk view (09) can split them out.
- The registry starts small (what you hold, plus major stablecoins). Unlisted assets still show up,
  each as its own coin, so the grouping can be incomplete but never wrong.
