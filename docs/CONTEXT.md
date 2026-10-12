# Glossary

The shared language of this project. Code, docs, and conversations use these terms with these
meanings. When a new term is introduced, add it here.

## Accounts and identity

- **Account** — any wallet address or venue account the platform knows about, whether it's mine or
  not. Identified by a unique **ref**. Table: `accounts`.
- **Ref** — an account's canonical ID: CAIP-10 for wallets (`eip155:4663:0xabc…`),
  `venue:<venue>:<id>` for venue accounts. See [0013](adr/0013-chain-agnostic-identity.md).
- **Ownership** — whose account it is; decides which calculations run on it:
  - **owned** — mine. Accounting-grade: cost basis, P&L, reconciliation.
  - **tracked** — someone else's that I follow (KOL, profitable wallet). Analytics-grade.
  - **observed** — seen during analysis, never deliberately followed. Stored lightly.
- **Entity** — a person or group controlling one or more accounts. **Self** is the single entity
  that owns all my accounts; a KOL or a bundler **cluster** is another. Table: `entities`.
- **Label** — a claim about an account ("insider", "sniper", "deployer"), carrying source,
  confidence, and timestamp. Data, not truth; revisable with history.
- **Wallet** — an address you control, spanning every chain of its family (one EVM address = one
  wallet on Ethereum and Robinhood Chain; a Solana address = one wallet on Solana). It has a name
  and groups its per-chain accounts. Table: `wallets`. See [ADR 0016](adr/0016-wallets.md).
- **Wallet account** vs **venue account** — a wallet account is one wallet on one chain (read via a
  chain adapter); a venue account is an exchange/app account read via its API (Coinbase,
  Hyperliquid).
- **Chain family** — chains sharing an address format and adapter: `evm` (Ethereum, Robinhood
  Chain), `solana`, and `bitcoin` (one address per wallet, any standard type: `1…`, `3…`, `bc1q…`,
  `bc1p…`).
- **Venue asset** — a holding at a venue, identified within that venue only:
  `venue:coinbase/currency:ETH` (asset kind `venue`). See [ADR 0018](adr/0018-venue-assets.md).
- **View-only key** — a venue API key that can read but not trade or transfer. It's the one key
  allowed outside execution, and every sync checks its permissions first. See
  [ADR 0017](adr/0017-view-only-venue-keys.md).
- **Underlying** — the coin an asset gives exposure to (`eth`, `btc`, `sol`, `usdc`), from a
  hand-curated registry. Its **form** says how it's held: native, wrapped, staked, restaked, or at a
  venue. Unknown assets are their own underlying. See [ADR 0019](adr/0019-underlying-grouping.md).
- **CAIP-2 / CAIP-10 / CAIP-19** — standard IDs for chains, accounts, and assets.

## Ledger

- **Source / adapter** — code that reads one provider or chain family. Lives in
  `packages/sources`.
- **Raw record** — an immutable provider response, stored as received and deduplicated by
  provider + request + content. Insert-only, enforced by a database trigger.
- **Canonical event** — a chain-agnostic interpretation of raw records: `transfer`,
  `internal_move`, `trade`/`fill`, `fee`, `funding_payment`, `perp_*`, `reward`, `lp_*`,
  `unclassified`.
- **Decoder** — logic that turns a protocol's raw transactions into canonical events.
- **Unclassified** — an event the system doesn't understand yet. Shown explicitly; any number that
  depends on it is marked incomplete.
- **Internal move** — a transfer between two of my own accounts. Not a sale plus a buy; cost basis
  carries over.
- **Reconciliation** — comparing the balance derived from events with the observed balance. Match
  means the ledger is complete.
- **Accounting-grade vs analytics-grade** — exact, reconciled numbers (owned accounts) vs
  approximate behavior analysis, labeled as approximate (tracked accounts).
- **Sync run** — one attempt to read an account's balances (`sync_runs`). Its status is `succeeded`,
  `partial` (finished, but couldn't see everything; its notes say what), or `failed`. Holdings come
  from each account's newest succeeded-or-partial run.
- **Balance snapshot** — what an account held at one sync run, linked to the raw record it came
  from. Zero balances aren't stored.
- **Asset status** — `verified` (counted), `unverified` (hidden, not counted), or `spam` (marked by
  you). Set automatically or manually; manual wins. See
  [ADR 0014](adr/0014-asset-verification.md).
- **Price confidence** — `high` or `low`. High needs a deep market (≥ $50K liquidity) and no source
  disagreement. Low-confidence value is shown separately. See
  [ADR 0015](adr/0015-pricing-on-chain-first.md).
- **Cross-check** — DefiLlama's price compared against the on-chain market price. A difference over
  25% is a **disagreement**: the on-chain price is used and the disagreement is shown.
- **Market data** — market cap, FDV, and liquidity from the price's own source, stored with it.
- **Thin liquidity (illiquid)** — a position worth more than 10% of its pool's liquidity; its value
  probably can't be realized at that price.
- **Stale** — balances or prices older than their threshold (by default: balances after two missed
  syncs, prices after an hour). Stale data is shown, flagged, never hidden.
- **Small balance** — a verified, priced holding worth less than the small-balance threshold ($3 by
  default). Folded into one line in lists, and still counted in every total. (The allocation chart
  folds by share instead: see **Other**.)
- **Scope** — what the portfolio page shows: all wallets, or one wallet. Totals, notices, the
  overview, and lists all follow it.
- **Allocation** — each coin's (every form of it, wherever it's held), wallet's, or chain's or
  venue's share of the scope's priced total.
- **Breakdown** — what an allocation row is made of: a category's, theme's, wallet's, or chain's
  coins, a coin's holdings (each form in each place), or the rows Other folds. Opening a slice
  (**drill-down**) shows it as its own chart, with shares of that row and of the total.
- **Other** (allocation) — the rows worth less than 0.1% of a chart, folded into one row that opens
  to list them. Only when two or more qualify; Uncategorized and No theme never fold.
- **Concentration** — the share of the total in the largest coin, and in the top three.
- **Category** — your label for a coin's role, at most one per coin (e.g. Major, Speculative,
  Stable). The by-category view adds up to 100%, and coins without one are "Uncategorized".
- **Theme** — your label for what a coin is a bet on, any number per coin (e.g. V4 Hooks). In the
  theme view a coin counts once, under its **theme combination** (all its themes together, e.g.
  "Privacy + Quantum"), so the view adds up to 100% ([ADR 0020](adr/0020-theme-allocation-by-combination.md)).
  A lightweight precursor of narratives (step 14).
- **Coin key** — how a coin is identified for tags and groupings: a registry ID (`eth`) or, for a
  coin outside the registry, its asset ID. Never a ticker.
- **Value history** — the scope's total value over time, replayed from stored balance snapshots and
  prices as the dashboard would have shown it then, counting the assets verified now
  ([ADR 0021](adr/0021-value-history-replayed.md)). Value, not performance: deposits, withdrawals,
  and added wallets move it. Where nothing synced it has a **gap**; where a sync was partial the
  point is **incomplete** (drawn dashed).
- **Addition** — a wallet or venue account whose tracking began inside a value-history range. Its
  arrival is a step up in the line, not a gain, so the range's change isn't shown.
- **24h change** — how current holdings moved in value over 24 hours: the price now against the
  **baseline price**, our own recorded price from the same source about 24 hours earlier. A price
  move, not P&L: deposits, withdrawals, and trades don't count.
- **Note** — a machine-readable remark on a result (`code` + `message`): something skipped,
  missing, or approximate. Surfaced to the user rather than dropped.
- **Raw amount** — an integer quantity in a token's smallest unit (wei, lamports). Always `bigint`.
- **Dec** — the decimal type for human-scale values (prices, USD values). Never JS `number`.

## Research

- **Research report** — a structured, versioned, source-backed analysis of one token.
- **Report depth** — `quick` (objective checks, no LLM, near-free) or `full` (adds fundamentals
  and LLM synthesis).
- **Token type** — a classification (e.g. memecoin vs project) that decides whether fundamentals
  run.
- **Insider analysis** — detecting snipers, bundled wallets, insider/dev wallets, funding
  clusters, and holder concentration. Built on the investigation capability.
- **Investigation** — the reusable capability for tracing funding, clustering wallets, and
  labeling accounts. Powers insider analysis now and wallet tracking later.
- **Gap** — data the report couldn't obtain, shown explicitly rather than guessed.

## AI

- **`generate`** — AI primitive for writing and reasoning (synthesis, theses). Claude by default.
- **`decide`** — AI primitive for fast typed judgments with confidence (classify, score, route,
  verify). Claude now; Jev later.
- **Jev** — TypeSafe AI's "System One" model: typed decisions with calibrated confidence, low
  latency, no text generation.

## Execution (priority 2)

- **Executor** — the only program allowed to hold keys and sign. Not built yet.
- **Hot wallet** — a dedicated wallet with a capped balance, used only by the executor.
- **Trade intent** — what an agent submits instead of signing ("buy X, max $Y, slippage Z"). The
  executor validates it against hard limits.
- **Hard limits** — per-trade cap, daily loss limit, allow/deny lists, kill switch. Not writable by
  the running app.

## Platform

- **App** — a program you run (`apps/`: api, worker, cli, web).
- **Package** — shared logic that apps are built from (`packages/`).
- **Capability** — one thing the platform can do (e.g. `addAccount`), implemented once in a
  package and exposed through any interface.
- **Job** — background work with a typed contract (`JOBS` in `packages/core`), run by the worker
  through the Postgres-backed queue.
- **Heartbeat** — the worker's periodic liveness record; drives the dashboard's health view.
- **Strategy version** — an immutable snapshot of strategy rules; every recommendation pins one.

## Process

- **Brief** — written before building a feature: what, why, scope, acceptance criteria.
  `docs/briefs/`.
- **Build log** — written after: what was built, deviations, gaps, how to verify.
  `docs/build-logs/`.
- **ADR** — a short record of one decision and why. `docs/adr/`.
