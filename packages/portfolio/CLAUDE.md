# packages/portfolio

Answers "what do I own, what is it worth, and how did I get here?" for **owned** accounts only.
Design: [ADR 0002](../../docs/adr/0002-ledger-truth-and-reconciliation.md),
[ADR 0014](../../docs/adr/0014-asset-verification.md).

- `setup.ts`: `PortfolioEnv` and `createPortfolioDeps()`, the one way apps build these capabilities.
- `sync.ts`: `syncAccountBalances` (a wallet on one chain, or a venue account) and
  `syncAllOwnedAccounts` (every wallet, then every venue that's set up). Raw records, assets, and
  snapshots are written in one transaction, and a failure becomes a failed sync run, never a crash.
- `prices.ts`: `refreshPrices` prices held assets (verified first; venue assets on their venue's
  market), applies automatic verification, and records misses for a cooldown.
- `holdings.ts`: `buildHoldingsView` (pure) and `getHoldings` (loads, then builds). This is the
  dashboard's "what do I own", for everything or one wallet or venue account (`walletId`). Venue
  accounts appear as groups with one section. It also builds the overview (`buildOverview`:
  allocation by coin, exact asset, category, theme combination, wallet, and chain; concentration by
  coin), flags small balances, and measures 24h change against same-source baselines
  (`pickBaselines`, `summarizeChange`). Coin rows carry their category and themes (step 02b). Every
  allocation row carries its `breakdown` (rows under `allocationOtherBelowShare` fold into an Other
  row), so any slice can be opened (step 02e).
- `history.ts`: `buildValueHistory` (pure) and `getValueHistory`: the scope's value over time,
  replayed from stored balance snapshots and prices on a grid (step 02f, ADR 0021), with gaps,
  incomplete points, and added wallets marked. Its final point equals the holdings total.
- `assets.ts`: `setAssetStatus` (manual verified/unverified/spam, with history).
- `wallets.ts`: `addWallet` (idempotent; every chain of the family by default), `renameWallet`, and
  `removeWallet` (the wallet, its accounts, and their sync history; raw records stay).

Done: balances and values for owned wallets (01); wallets, market data, and on-chain-first prices
(01a); the overview (01b); Coinbase, Hyperliquid, and coin grouping (02); Bitcoin (02a); categories
and themes (02b); removing a wallet (02d); allocation breakdowns (02e); value over time (02f).
Next: perp positions (02c, when you trade perps), then events, lots, cost basis, P&L, and
reconciliation (06–09).

## Rules

- **Accounting-grade.** Numbers must reconcile; anything uncertain is flagged, never smoothed over.
- **Owned accounts only.** Tracked and observed accounts belong to `investigation`.
- **Only verified, priced assets count in totals** ([ADR 0014](../../docs/adr/0014-asset-verification.md)).
  Hidden assets are counted and estimated separately, never dropped. Manual status beats automatic
  rules. Automatic verification requires a quote with `verifies: true`: DefiLlama high confidence
  that agrees with the on-chain market ([ADR 0015](../../docs/adr/0015-pricing-on-chain-first.md)).
- **Flag what can't be trusted, don't hide it:** source disagreements and thin-liquidity positions
  are counted (if verified) but surfaced, and their value is included in the low-confidence share.
- **The wallet is the unit people think in** ([ADR 0016](../../docs/adr/0016-wallets.md)): names
  live on wallets; views group wallet → chain.
- **Never guess:** incomplete readings make a sync `partial` with notes; an unpriced asset is "no
  price", never $0.
- **Keep the last good data visible.** A failed sync doesn't erase balances. Holdings come from each
  account's newest succeeded-or-partial run and are flagged stale when too old.
- **Internal moves are not disposals** (from step 08). Transfers between owned accounts carry cost
  basis across.
- **Derived state is recomputable** from raw records. Store derivations as snapshots, never as the
  only copy of the truth.
- **Exact math only** (`RawAmount`/`Dec`). The view emits decimal strings; never floats.
- **Keep `buildHoldingsView` pure** so its logic can be tested without a database.
- **Folding is display only.** A holding under `smallBalanceUsd` is flagged and folded in lists,
  and allocation rows under `allocationOtherBelowShare` fold into Other, but both stay in every
  total and share.
- **Value history is replayed, never stored** ([ADR 0021](../../docs/adr/0021-value-history-replayed.md)):
  compute it from balance snapshots and prices with today's verification, mark gaps, partial syncs,
  and added wallets, and keep its last point equal to the holdings total.
- **24h change is a price move, not P&L.** It compares today's quantity at today's price with the
  same source's recorded price from ~24h earlier (within `baselineToleranceMs`). No baseline means
  no change ("—"), never a guess from another source.
