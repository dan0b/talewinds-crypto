# packages/core

The shared domain vocabulary as code: types, identity, validation schemas, and pure functions.
Everything else depends on it, including the browser dashboard.

- `chains.ts` — supported chains (CAIP-2 IDs, families, native asset). **Add a chain here first.**
- `venues.ts` — supported venues (Coinbase, Hyperliquid), `VENUE_INFO` (name, `venue:<name>` scope
  ID), and `placeName` (a chain's or venue's display name).
- `assets.ts` — asset identity (CAIP-19 refs, plus venue assets `venue:coinbase/currency:ETH`,
  [ADR 0018](../../docs/adr/0018-venue-assets.md)), statuses, and token-text sanitizing.
- `underlyings.ts` — the hand-curated coin registry (`underlyingOf`): which coin an asset counts
  toward, and in what form ([ADR 0019](../../docs/adr/0019-underlying-grouping.md)). Every token
  entry cites how its contract was verified; unlisted assets are their own coin.
- `addresses.ts` — address validation and normalization per chain family.
- `accounts.ts` — ownership, account kinds, entity kinds, `NewAccountInput`, `normalizeAccount` (refs).
- `amounts.ts` — `RawAmount` (`bigint`), `Dec` (decimal), formatting/parsing, `toJson`.
- `jobs.ts` — background job contracts (`JOBS`): name + input/output schemas.
- `env.ts` — `parseEnv`, pure env validation.

## Rules

- **No I/O.** No network, filesystem, database, `process.env`, or Node-only APIs. This package runs
  in the browser too.
- **Depends on nothing in the workspace.** Third-party dependencies are limited to `zod` and
  `decimal.js`. Adding another needs a reason.
- **Schemas are the source of truth.** Define a Zod schema and derive the type with `z.infer`;
  don't hand-write a parallel type.
- **Closed sets are `as const` arrays plus `z.enum`**, not TypeScript enums.
- **Amounts:** raw on-chain quantities are `RawAmount` (`bigint`); human-scale values are `Dec`.
  Never `number`.
- **Every function here gets unit tests.** They're pure, so there's no excuse.
