# packages/sources

Every connection to the outside world for *reading* data: chain RPCs and indexers, venue APIs,
market data, and security-check providers. **Empty until V0a.**

## Planned structure

```
src/
  chains/evm/        one adapter for every EVM chain, configured by chain ID (Ethereum, Robinhood)
  chains/solana/     Solana adapter (Helius parsed transactions)
  venues/hyperliquid/
  venues/coinbase/
  market/            prices + market structure (DexScreener, GeckoTerminal, CoinGecko, Jupiter…)
  security/          token safety checks (RugCheck, GoPlus…)
  shared/            rate limiting, caching, raw-record capture, cost metering
```

## Rules

- **Read-only.** No transaction building, signing, or key handling of any kind
  ([ADR 0001](../../docs/adr/0001-execution-boundary.md)).
- **Adapters by chain family, not by chain.** A new EVM chain is configuration, not a new adapter.
- **Validate every response with Zod** before it leaves the adapter. Never trust a provider's
  shape.
- **Capture raw responses** as immutable raw records (with provider, request, and fetch time)
  before interpreting them, so everything derived can be recomputed.
- **Every adapter has rate limiting, caching, and retry with backoff.** We're on free tiers
  ([ADR 0009](../../docs/adr/0009-data-providers-and-cost-tracking.md)).
- **Provider choice is configuration.** Upgrading to a paid tier or swapping a provider must not
  require changes outside this package.
- **Credentials come from env and are read-only** (read-only API keys for venues). Never log them.
- **Return exact amounts** (`RawAmount`/`Dec`), never JS numbers, even if the provider sends
  numbers.
- **Test against recorded fixtures** of real provider responses, not live calls.
