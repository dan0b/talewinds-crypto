# Talewinds — Vision

> Supersedes [`briefs/original-concept-brief.md`](briefs/original-concept-brief.md). The build plan
> is [`ROADMAP.md`](ROADMAP.md). Decisions behind everything here are recorded in [`adr/`](adr/).
> Terms are defined in [`CONTEXT.md`](CONTEXT.md).

## What this is

A complete, personal crypto platform for one user. It should let me:

- see and manage every position across all my wallets, chains, and venues;
- automate my research pipeline for new opportunities;
- stay current on what I hold, with AI assisting portfolio management;
- build tooling as needs arise — news aggregation, thesis creation, memecoin tooling;
- run trading agents across strategies (agentic trading is a core interest);
- track wallets and investigate on-chain activity.

## Priorities

1. **Research automation & portfolio management** — built first.
2. **Agentic trading** — the structure is ready for it from day one
   ([0001](adr/0001-execution-boundary.md)), but it is built second.

Everything else (news, thesis tooling, memecoin tooling) is deliberately open-ended: the
architecture leaves room for it without designing around it.

## Where my assets live (in scope now)

| Source | What matters | Notes |
|---|---|---|
| Robinhood Chain | Trading venue; medium/longer-term plays | EVM, chain ID 4663 |
| Solana | Trading; memecoins (rarely worth deep research) | |
| Ethereum | Funding/transit layer — bridging to Robinhood Chain | Transfers + bridges must keep cost basis intact |
| Hyperliquid | Perps + spot; funding history | Track even with no open positions |
| Coinbase | Holds a meaningful position | Read-only API key |

## Roadmap

The full plan, with one brief per step, is in [`ROADMAP.md`](ROADMAP.md). In brief:

| Phase | Steps | Outcome |
|---|---|---|
| **Foundation** ✅ | 00 | Monorepo, database, worker, API, dashboard shell, CLI, guardrails, docs |
| **V0a — What do I own** | 01–02 | Current balances and values across all five sources |
| **V0b — Contract address → research report** | 03–05 | Solana reports at `quick` and `full` depth, with insider analysis and AI synthesis |
| **V1 — Trust the numbers, deepen research** | 06–11 | Trade history, cost basis, P&L, reconciliation; Robinhood Chain research; fundamentals |
| **V2 — Always on, always aware** | 12–19 | Always-on hosting, watchlist, narratives and theses, alerts, wallet tracking, news, AI assistant |
| **V3 — Strategy-aware decisions** | 20–21 | Strategy rules as versioned data; explainable recommendations |
| **Priority 2 — Agentic trading** | 22–26 | Paper trading, isolated executor, live agents, Jev, on-chain execution |

Build order rationale: [0008](adr/0008-build-order.md).

## Principles and guardrails

Carried forward from the original brief, revised where decisions changed them:

- **The core never holds keys.** Research, portfolio, and AI code is read-only by construction.
  Execution is isolated, signs only from capped hot wallets, and only after hard-limit checks. Main
  wallets are watch-only. ([0001](adr/0001-execution-boundary.md))
- **Rules before recommendations.** AI gathers and synthesizes; explicit, versioned strategy rules
  govern scoring and sizing. Until the strategy document exists, nothing presents provisional
  scores or sizing as settled policy.
- **Evidence over confidence.** Cite sources, timestamps, gaps, and contradictions.
- **Every number is correct or visibly incomplete — never silently wrong.** Unknown activity is
  `unclassified`; reconciliation proves completeness. ([0002](adr/0002-ledger-truth-and-reconciliation.md))
- **Contract-first identity.** Chain + contract (CAIP), never a ticker alone.
  ([0013](adr/0013-chain-agnostic-identity.md))
- **Security by design.** Read-only credentials, least privilege, secrets out of the repo, the
  database, and logs; supply-chain hardening on every dependency.
  ([0005](adr/0005-typescript-monorepo.md))
- **Data freshness is visible.** Stale prices, research, or sync state must be obvious.
- **Manual override with history.** Corrections never erase the original record.
- **No false precision.** Ranges and confidence levels where inputs are uncertain.
- **Process over prediction.** Judge discipline and evidence, not just returns.
- **Incremental delivery.** Thin vertical slices, each proven end to end.

## Feedback loop

```text
Narrative or idea
      ↓
Structured research → my decision → on-chain activity → portfolio/performance
      ↑                                                    ↓
      └──────────── reviews, outcomes, and lessons ─────────┘
```

## Open questions (decide when they become relevant)

- **Cost-basis method** (FIFO / HIFO / specific ID) and **history depth** — V1.
- **Authentication** — required before the API/dashboard is reachable beyond localhost.
- **Execution hard-limit storage** — must not be writable by the running app. Priority 2.
- **Venue asset identity** (Coinbase, Hyperliquid perps) — V0a.
- **The strategy document** — capital buckets, sizing, research checklist, scoring thresholds. Will
  be stored as versioned data ([0007](adr/0007-postgres-single-source-of-truth.md)).
- **Tax accounting** — out of scope for early versions.

## Decisions

| ADR | Decision |
|---|---|
| [0001](adr/0001-execution-boundary.md) | Execution boundary: read-only core, isolated execution, watch-only main wallets |
| [0002](adr/0002-ledger-truth-and-reconciliation.md) | One pipeline, never guess, reconcile |
| [0003](adr/0003-runtime-and-hosting.md) | Local-first, server-shaped; EC2 later |
| [0004](adr/0004-interfaces-and-capabilities.md) | Dashboard first, CLI for ops; capabilities live once |
| [0005](adr/0005-typescript-monorepo.md) | TypeScript monorepo with supply-chain hardening |
| [0006](adr/0006-application-stack.md) | Application stack |
| [0007](adr/0007-postgres-single-source-of-truth.md) | Postgres is the single source of truth |
| [0008](adr/0008-build-order.md) | Build order: V0a + V0b thin slices |
| [0009](adr/0009-data-providers-and-cost-tracking.md) | Free data tiers first; minimal cost tracking |
| [0010](adr/0010-ai-generate-and-decide.md) | AI primitives: `generate` and `decide` (Jev) |
| [0011](adr/0011-research-scope.md) | Research scope: low-to-mid caps, insider analysis first |
| [0012](adr/0012-accounts-entities-ownership.md) | Accounts, entities, and ownership |
| [0013](adr/0013-chain-agnostic-identity.md) | Chain-agnostic identity (CAIP) |
