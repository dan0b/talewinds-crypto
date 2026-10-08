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
