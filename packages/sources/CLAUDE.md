# packages/sources

Every connection to the outside world for *reading* data: chain RPCs and indexers, venue APIs,
market data, and (later) security-check providers. Providers and their free-tier limits were tested
live on 2026-09-28; see the Decisions section of `docs/briefs/01-wallet-balances.md`.

```
src/
  index.ts            createSources(env): wallets per chain + prices + describe()
  config.ts           per-chain endpoints and provider identifiers (CHAIN_PROVIDERS)
  env.ts              SourcesEnv (ALCHEMY_API_KEY, *_RPC_URL overrides), all optional
  types.ts            RawCapture, ObservedAsset/Balance, BalanceReading, PriceQuote, …
  shared/             ProviderClient (rate limit, retry, timeout, Zod), JSON-RPC, exact JSON, meter
  chains/evm/         one adapter for every EVM chain: RPC + Blockscout or Alchemy token discovery
  chains/solana/      RPC (Token + Token-2022 accounts) + Jupiter metadata
  prices/             on-chain first (Jupiter / DexScreener) + DefiLlama natives & cross-check
  testing/            fakeFetch + fixture helpers (tests only)
test/fixtures/        recorded provider responses (see its README)
```

## Rules

- **Read-only.** No transaction building, signing, or key handling of any kind
  ([ADR 0001](../../docs/adr/0001-execution-boundary.md)). Read-only `eth_call` simulations are fine.
- **Adapters by chain family, not by chain.** A new EVM chain is an entry in `CHAIN_PROVIDERS` plus
  the core chain registry, not a new adapter.
- **Every HTTP call goes through `ProviderClient`.** That gives it rate limiting, retry with backoff,
  a timeout, request metering, and Zod validation of the response. Never call `fetch` directly.
- **Parse amounts exactly.** `ProviderClient` parses JSON with `parseProviderJson`, which keeps
  integers above 2^53 as exact strings; amount schemas accept `number | string` and convert to
  `bigint`. Never do math on a float from a provider.
- **Return raw captures with every result**, and link each observation to the capture it came from
  (`captureIndex`). Persistence happens in `portfolio`, not here: adapters only fetch and parse.
- **Request keys and provider names must be secret-free.** Build `requestKey` from method +
  parameters, never from the URL (Alchemy and Helius URLs embed keys). There's a test for this.
- **Token metadata is attacker-controlled.** Pass symbols and names through `sanitizeTokenText`;
  never let them decide control flow. Decimals come from chain data (RPC, or an indexer that reads
  the contract); a token with no readable decimals is skipped with a note, never guessed.
- **Report what you couldn't see.** Missing access (e.g. no Alchemy key), capped lookups, and
  skipped items become `notes`, and `complete: false` when the reading is partial. A provider
  error in an optional step (token discovery) makes the reading partial, not failed; only a
  failure to read the native balance fails it.
- **Price tokens where they trade** ([ADR 0015](../../docs/adr/0015-pricing-on-chain-first.md)):
  Jupiter (Solana) or the deepest DexScreener pool (EVM) first; DefiLlama for natives and as a
  cross-check. Never trust an aggregator's confidence score on its own for long-tail tokens.
- **Keep one client per provider** (e.g. the Jupiter client is shared by the Solana adapter and
  pricing), so rate limits hold across callers.
- **Pass secrets to `ProviderClient` via `redact`.** Provider error text is included in errors (it's
  often the only useful explanation); `redact` scrubs keys from it.
- **Keep free tiers safe:** cap per-call work (metadata lookups, price requests) and skip redundant
  calls using `known` assets.
- **Tests use recorded fixtures, never live providers.** Re-record when a provider changes shape;
  keep fixtures small and from public addresses of well-known entities, never the user's wallets.
