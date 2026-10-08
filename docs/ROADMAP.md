# Roadmap

How the [vision](VISION.md) gets built. **Each step is one brief** in [`briefs/`](briefs/). For
each step: re-read the brief, refine it if needed, build it, write its build log, and mark it done
here.

## Status key

| Status | Meaning |
|---|---|
| ✅ Done | Built; the brief links its build log |
| Ready | Specified well enough to build now |
| Planned | Direction is clear; details get refined when the step starts |
| Draft | Direction only; needs a planning session before building |

Dependencies in parentheses are soft: they help, but aren't required.

## Steps

### Foundation

| # | Step | Status | Depends on | Delivers |
|---|---|---|---|---|
| 00 | [Scaffold](briefs/00-scaffold.md) | ✅ Done | — | Monorepo, database, worker, API, dashboard shell, CLI, guardrails, docs |

### V0a — What do I own

| # | Step | Status | Depends on | Delivers |
|---|---|---|---|---|
| 01 | [Wallet balances: Ethereum, Robinhood Chain, Solana](briefs/01-wallet-balances.md) | ✅ Done¹ | 00 | Holdings and USD values for every owned wallet, with freshness |
| 01a | [Wallets, market data, and price accuracy](briefs/01a-wallets-and-market-data.md) | ✅ Done¹ | 01 | Add and name wallets in the dashboard; holdings by wallet → chain; market cap; on-chain-first prices |
| 02 | [Venue balances & positions: Hyperliquid, Coinbase](briefs/02-venue-balances.md) | Ready | 01 | All five sources in one total; perp positions |

¹ Robinhood Chain token balances await the Robinhood Chain network being enabled in your Alchemy
app; see the [01a build log](build-logs/2026-09-29-wallets-and-market-data.md).

### V0b — Contract address → research report

| # | Step | Status | Depends on | Delivers |
|---|---|---|---|---|
| 03 | [Quick research report: Solana](briefs/03-quick-research-report.md) | Ready | 01 | Paste a mint → identity, market, holders, security in seconds; no LLM |
| 04 | [Insider analysis: Solana](briefs/04-insider-analysis-solana.md) | Ready | 03 | Snipers, bundles, deployer behavior, funding clusters, with evidence |
| 05 | [Full research report: AI layer + synthesis](briefs/05-full-research-report.md) | Ready | 03, 04 | Token type, thesis / counter-thesis / red flags, cost tracking; `packages/ai` |

### V1 — Trust the numbers, deepen research

| # | Step | Status | Depends on | Delivers |
|---|---|---|---|---|
| 06 | [Ledger foundation: venue fills](briefs/06-ledger-foundation.md) | Planned | 02 | Events, lots, cost basis, P&L, proven on clean venue data |
| 07 | [On-chain trade decoding](briefs/07-onchain-trade-decoding.md) | Planned | 01, 06 | Your Solana and Robinhood Chain swaps as priced trades |
| 08 | [Transfers, bridges & reconciliation](briefs/08-transfers-bridges-reconciliation.md) | Planned | 06, 07 | Moves between your accounts keep cost basis; every account reconciles |
| 09 | [Risk & performance dashboard](briefs/09-risk-and-performance-dashboard.md) | Planned | 06–08 | Exposure, concentration, P&L over time, what changed |
| 10 | [Robinhood Chain research](briefs/10-robinhood-chain-research.md) | Planned | 03–05 | EVM security checks and insider analysis |
| 11 | [Fundamentals research](briefs/11-fundamentals-research.md) | Planned | 05 (10) | Team, product, tokenomics, traction; claims vs facts |

### V2 — Always on, always aware

| # | Step | Status | Depends on | Delivers |
|---|---|---|---|---|
| 12 | [Deploy: always-on hosting](briefs/12-deploy.md) | Draft | 01–05 | 24/7 on EC2, private access, backups |
| 13 | [Research workflow](briefs/13-research-workflow.md) | Draft | 05 (12) | Watchlist, scheduled re-runs, report diffs |
| 14 | [Narratives & thesis journal](briefs/14-narratives-and-theses.md) | Draft | 13 (06–08) | Narratives, theses, decisions, reviews, trade ↔ thesis links |
| 15 | [Alerts & Telegram](briefs/15-alerts-and-telegram.md) | Draft | 12, 13 | Push alerts; `/research <CA>` from your phone |
| 16 | [Tracked wallets & live feeds](briefs/16-tracked-wallets.md) | Draft | 04, 07, 12, 15 | KOL and smart-money buys in near real time |
| 17 | [Wallet & holder analytics](briefs/17-wallet-and-holder-analytics.md) | Draft | 16 | Strategy breakdowns of profitable wallets; big-holder activity |
| 18 | [News aggregation](briefs/18-news-aggregation.md) | Draft | 13, 14 | A relevance-filtered daily digest |
| 19 | [AI portfolio assistant](briefs/19-ai-portfolio-assistant.md) | Draft | 09, 13, 14 (18) | MCP server and a daily briefing |

### V3 — Strategy-aware decisions

| # | Step | Status | Depends on | Delivers |
|---|---|---|---|---|
| 20 | [Strategy framework as versioned data](briefs/20-strategy-framework.md) | Draft | 09, strategy session | Your investment framework as explicit, versioned rules |
| 21 | [Decision support & process analytics](briefs/21-decision-support.md) | Draft | 14, 20 | Explainable recommendations; evidence of whether the process works |

### Priority 2 — Agentic trading

| # | Step | Status | Depends on | Delivers |
|---|---|---|---|---|
| 22 | [Backtesting & paper trading](briefs/22-backtesting-and-paper-trading.md) | Draft | 05, 06–09 | Trade-intent contract, simulated executor, backtests |
| 23 | [Executor & hot wallets](briefs/23-executor-and-hot-wallets.md) | Draft | 22 | The only code that signs, with hard limits and a kill switch |
| 24 | [First live agent](briefs/24-first-live-agent.md) | Draft | 23 | One strategy, live, at small size |
| 25 | [Agent platform & Jev](briefs/25-agent-platform-and-jev.md) | Draft | 24 | Many strategies; Jev qualified on measured calibration |
| 26 | [On-chain execution & memecoin tooling](briefs/26-onchain-execution-and-memecoin-tooling.md) | Draft | 23 (04, 16) | Exploratory; starts with a read-only discovery feed |

## Order

Build in number order by default. Where dependencies allow, tracks can interleave:

- After 01, steps 02 and 03 are independent of each other.
- In V1, the research steps (10–11) can run alongside the ledger steps (06–09).
- The Jev evaluation harness (part of 25) can be pulled forward as soon as Jev access arrives.

**Next up: 02** (needs a view-only Coinbase API key) **or 03** (needs nothing).

## Vision coverage

Every part of the [vision](VISION.md) maps to steps:

| Vision | Steps |
|---|---|
| Manage and view all positions across wallets, chains, and venues | 01, 02, 06–09 |
| Automate the research pipeline for new opportunities | 03–05, 10, 11, 13 |
| Track positions, stay up to date, AI-assisted portfolio management | 09, 13, 15, 18, 19 |
| Tooling: thesis creation, news aggregation, memecoin tooling | 14, 18, 26 |
| Trading agents across strategies | 22–25 (26) |
| Wallet tracking and on-chain investigation | 04, 16, 17 |

## Recurring work (not steps)

- **Adding a chain, venue, or data provider.** Follows the adapter pattern in `packages/sources`.
  A short playbook gets written with the first addition after step 02.
- **Upgrading a provider to a paid tier** when free-tier limits bite
  ([ADR 0009](adr/0009-data-providers-and-cost-tracking.md)).
- **Dependency upgrades**, respecting the 7-day release-age rule.

## Not on the roadmap

- Tax reporting (out of scope for now).
- Signing with main wallets. They stay watch-only ([ADR 0001](adr/0001-execution-boundary.md)).
- Multiple users; a native mobile app (Telegram covers mobile).

## How this roadmap changes

- It's a living plan: split, merge, or reorder steps as reality demands. When a step's scope
  changes materially, update its brief *before* building.
- A Draft step becomes Planned or Ready after a planning session updates its brief.
- When a step is finished: mark it ✅ Done here and in its brief, and link the build log.
- New steps take the next free number. To insert between existing steps, use a letter suffix (e.g.
  `07a`) instead of renumbering.
