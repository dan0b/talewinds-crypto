# Fixtures

Recorded provider responses used by adapter tests, so tests never call live providers.

- Recorded 2026-09-28 from public endpoints, against public addresses of well-known entities:
  Vitalik Buterin's wallet (Ethereum, trimmed from 8,053 entries), the WETH contract (Robinhood
  Chain), and Circle's developer wallet (Solana).
- `alchemy-*.json` are **constructed from Alchemy's documented response shapes**, not recorded
  (no API key was available). Re-record them once a key exists.
- `blockscout-token-balances.json` includes one synthetic entry: a zero balance (must be dropped).

Re-record when a provider changes its response shape, and keep fixtures small.
- `jupiter-search-market.json` + `defillama-moin-disagreement.json` capture a real mispricing
  (2026-09-28): DefiLlama priced the pump.fun token moin ~100× above its on-chain market. Kept as
  the regression case for the on-chain-first pricing policy (ADR 0015).
- `coinbase-market-products.json` and `coinbase-exchange-rates.json` were recorded 2026-10-08 from
  Coinbase's **public** endpoints (no key, no account data), trimmed to a few products and rates.
- `coinbase-key-permissions.json`, `coinbase-accounts-page*.json`, and
  `coinbase-portfolio-breakdown.json` are **constructed from Coinbase's documented shapes** with
  made-up amounts: there's no public account to record. Check them against one real response once a
  key exists, and never copy real balances into them. Synthetic cases: an ETH balance split across
  available + hold and a vault, a zero BTC account (dropped), a 19-decimal amount (skipped with a
  note), and a staked SOL position (reported as a gap).
- `hyperliquid-*.json` were recorded 2026-10-08 from Hyperliquid's **public** info API, against
  well-known public accounts: the Assistance Fund (`0xfefe…fefe`; spot, perps, staking,
  sub-accounts) and the HLP vault (`0xdfc2…f303`; vault equities, trimmed to two). Spot metadata is
  trimmed to USDC, PURR, and HYPE, and the HYPE order book to five levels a side. One synthetic
  entry: a zero USDE balance in `hyperliquid-spot-state.json` (must be dropped).
- `esplora-address-*.json` were recorded 2026-10-08 from mempool.space for public addresses: the
  genesis address (`1A1z…DivfNa`, with real unconfirmed dust in its mempool stats) and BIP350's
  Taproot example (`bc1p0xlx…k5jj0`).

