# 0013 — Chain-agnostic identity (CAIP)

- **Status:** Accepted
- **Date:** 2026-09-27

## Decision

Identity uses the Chain Agnostic Improvement Proposals, so every chain — including future ones —
fits one format, and "never rely on a ticker" is structural rather than a convention:

| Thing | Standard | Examples |
|---|---|---|
| Chain | CAIP-2 | `eip155:1` (Ethereum), `eip155:4663` (Robinhood Chain), `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Wallet account | CAIP-10 | `eip155:4663:0xabc…`, `solana:5eyk…:7xKX…` |
| Asset | CAIP-19 | `eip155:1/erc20:0xa0b8…`, `eip155:1/slip44:60` (native ETH) |
| Venue account | our convention | `venue:coinbase:main`, `venue:hyperliquid:0xabc…` |

- EVM addresses are stored lowercase (case-insensitive); display code may checksum them. Solana
  base58 is case-sensitive and stored as-is.
- The supported-chain registry is `packages/core/src/chains.ts`.
- Robinhood Chain mainnet is chain ID 4663 (per Robinhood's docs and chainlist).

## Consequences

- Venue assets (Coinbase balances, Hyperliquid perps) need a mapping to CAIP-19 or a venue-scoped
  asset ID; decided in V0a.
