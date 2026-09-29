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
- **Wallet** vs **venue** — a wallet lives on a chain (read via a chain adapter); a venue is an
  exchange/app account read via its API (Coinbase, Hyperliquid).
- **Chain family** — chains sharing an address format and adapter: `evm` (Ethereum, Robinhood
  Chain) and `solana`.
- **CAIP-2 / CAIP-10 / CAIP-19** — standard IDs for chains, accounts, and assets.

## Ledger

- **Source / adapter** — code that reads one provider or chain family. Lives in
  `packages/sources`.
- **Raw record** — an immutable provider response, stored as received. Never edited.
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
