> **Superseded.** This is the original concept brief, kept for history. The current vision,
> roadmap, and principles are in [`../VISION.md`](../VISION.md); the decisions that changed this
> brief (notably: execution is allowed in an isolated service, scope is multi-chain, and all data
> lives in Postgres rather than files) are recorded in [`../adr/`](../adr/).

# Personal Crypto Trading & Research System

## Status

Concept brief for a future Codex build session. The architecture below is a starting shape, not a final technical specification; it should be refined as the investment framework and real workflows become clearer.

## Goal

Build a centralized, repo-based personal system that turns an evolving crypto investment process into a repeatable daily workflow. It should:

- track and develop market narratives;
- automate the collection and synthesis of token research;
- reconstruct portfolio state and trade history from on-chain activity;
- surface positions, exposure, P&L, and decision quality in a dashboard;
- preserve research, theses, and outcomes so the process improves over time; and
- recommend a possible position size under explicit user-defined rules, while leaving all trade execution to the user.

The system is intended to support disciplined decisions, not act as an autonomous trader or promise profitable outcomes.

## Important Context

- Trades occur **on Robinhood Chain**, not through Robinhood brokerage.
- Portfolio and trade history should therefore be derived from wallet activity using explorer, RPC, and/or indexer data.
- The system must **not place, sign, route, or execute trades**. It may produce research, alerts, simulations, and rule-based recommendations only.
- A separate document will later define the detailed capital-allocation strategy, position-sizing rules, research checklist, scoring model, and investability thresholds. That strategy document should become an explicit input to this system rather than being hard-coded prematurely.

## Scope

### In scope

- Wallet and address configuration for the user's Robinhood Chain activity
- On-chain ingestion, normalization, and classification of transactions
- Current holdings, cost basis, realized/unrealized P&L, exposure, and trade history
- Narrative records that can be updated as market understanding evolves
- A repeatable token-research workflow combining user context with public data
- Structured theses, risks, catalysts, evidence, and confidence levels
- Rule-based trade and sizing recommendations once the strategy document exists
- A dashboard for research, portfolio, performance, and review
- Historical snapshots and an audit trail for reproducible analysis

### Out of scope

- Automated trade execution, wallet signing, custody, or private-key handling
- Brokerage account integration unless deliberately added later
- Treating AI output as financial advice or as a substitute for user judgment
- A final allocation model or definitive research score in this document
- Perfect tax accounting in the initial versions

## Core Components

### 1. Narrative tracker

Maintains a living map of relevant themes such as RWA and Robinhood Chain: the thesis, supporting and opposing evidence, important projects, catalysts, maturity, risks, and last review date. Narratives should be versioned so changes in belief are visible over time.

### 2. Token research engine

Accepts a ticker plus optional contract address, chain, links, and user notes. It gathers available market, token, product, team, social, technical, usage, and narrative data; records sources and timestamps; identifies missing or conflicting evidence; and produces a structured research report.

### 3. On-chain portfolio and trade tracker

Imports activity for configured wallets from Robinhood Chain explorer/RPC/indexer sources, normalizes transfers and swaps, identifies assets and protocols, reconstructs positions and cost basis, and calculates portfolio and trade metrics. Raw source records should remain available so derived results can be audited and recalculated.

### 4. Decision and risk layer

Applies the separate strategy document to a research result and current portfolio state. It may return an investability outcome, risk class, candidate allocation, maximum exposure, entry/exit considerations, and reasons. Every recommendation should show the rules and data that produced it, and the user makes the final decision.

### 5. Dashboard and review tools

Presents current state, research, narratives, performance, and review prompts in one place. It should make stale data, low-confidence classifications, concentrated exposure, and broken theses easy to notice.

## Conceptual Repository Structure

```text
/
├── README.md                  # Purpose, setup, and daily workflow
├── config/                    # Wallets, chains, providers, and user preferences
├── strategy/                  # Future allocation and research-framework document
├── narratives/                # Living narrative records and supporting research
├── research/                  # Token reports, templates, evidence, and watchlist
├── data/
│   ├── raw/                   # Immutable imported chain/provider responses
│   ├── normalized/            # Transactions, trades, prices, and token metadata
│   └── snapshots/             # Point-in-time portfolio and metric snapshots
├── src/
│   ├── ingestion/             # Explorer/RPC/indexer and external-data adapters
│   ├── portfolio/             # Holdings, trade reconstruction, cost basis, P&L
│   ├── research/              # Collection, synthesis, and report generation
│   ├── narratives/            # Narrative maintenance and token linkage
│   ├── decisions/             # Rule evaluation and recommendation generation
│   └── dashboard/             # User interface and reporting
├── tests/                     # Fixtures and checks for calculations and pipelines
└── docs/                      # Architecture, decisions, operating notes, and roadmap
```

This is conceptual. Technologies, boundaries, and even top-level folders may change during implementation.

## Research Workflow

1. **Identify:** Enter a ticker and, whenever possible, its contract address and chain; add the source of the idea and any initial thesis.
2. **Resolve:** Confirm token identity and flag ticker collisions, unsupported assets, proxy contracts, or suspicious metadata.
3. **Collect:** Pull time-stamped data and links for market structure, tokenomics, team, product, code/activity, adoption, social presence, security, catalysts, and relevant narratives.
4. **Validate:** Compare sources, distinguish facts from claims, surface missing evidence, and assign data freshness and confidence.
5. **Synthesize:** Produce a concise thesis, counter-thesis, catalysts, failure conditions, key risks, open questions, and evidence-backed category findings.
6. **Evaluate:** Apply the future research checklist and scoring rules without silently inventing inputs.
7. **Contextualize:** Compare the candidate with current cash, positions, correlated exposure, risk limits, and existing narrative concentration.
8. **Recommend:** Return pass/watch/reject (or the later-defined outcome), a possible size range, and entry/exit considerations with clear rationale. This is advisory output only.
9. **Decide and record:** The user records the decision and reasoning. If a trade later occurs, the on-chain tracker detects it and links it back to the thesis when possible.
10. **Review:** Revisit the thesis after meaningful events, exits, and scheduled intervals; record what changed and what was learned.

## Data Model Ideas

| Entity | Purpose / example fields |
|---|---|
| Wallet | Address, label, chain, active dates |
| Asset | Chain, contract, symbol, decimals, verified metadata |
| Raw chain event | Provider, block/transaction/log identifiers, payload, fetched time |
| Normalized transaction | Wallet, timestamp, fees, transfers, protocol, classification, confidence |
| Trade / lot | Assets in/out, quantities, price basis, cost basis method, linked transaction(s) |
| Position snapshot | Asset quantity, valuation, cost basis, realized/unrealized P&L, timestamp |
| Price observation | Asset, quote currency, price, source, timestamp, confidence |
| Narrative | Thesis, stage, evidence, risks, catalysts, linked assets, revision history |
| Research report | Asset, category findings, sources, freshness, gaps, thesis, risks, version |
| Decision | Outcome, proposed size, applied rule-set version, user action, rationale |
| Review | Decision link, result, attribution, mistakes, lessons, follow-up changes |

Key modeling requirements:

- Separate immutable observations from derived calculations.
- Store source, timestamp, confidence, and version for consequential data.
- Use chain ID plus contract address as the primary token identity; a ticker alone is insufficient.
- Allow manual corrections while retaining the original value and an audit trail.
- Mark unknown classifications explicitly rather than forcing false precision.

## Dashboard Vision

The initial dashboard should answer five questions quickly:

1. **What do I own?** Holdings, valuations, cost basis, P&L, liquidity, and wallet location.
2. **Where is my risk?** Exposure by asset, risk bucket, narrative, time horizon, and correlated theme.
3. **What changed?** Recent on-chain activity, material price or thesis changes, and stale/failed data imports.
4. **What am I considering?** Research queue, watchlist, open questions, catalysts, and candidate recommendations.
5. **How is the process performing?** Realized/unrealized results plus decision-quality measures such as rule adherence, thesis accuracy, and performance by setup—not just headline P&L.

Later views may include trade drill-down, narrative timelines, allocation versus limits, portfolio history, benchmark comparisons, and structured post-trade reviews.

## Phased Build Plan

### V0 — Foundation and validation

- Choose one wallet and confirm Robinhood Chain data access and provider coverage.
- Import a small activity sample and manually verify transaction/trade interpretation.
- Define canonical schemas, configuration, storage approach, and test fixtures.
- Create narrative and research templates plus one manually produced sample report.
- Document known gaps, especially pricing, swaps, bridges, liquidity actions, and token identity.

**Exit condition:** the system can reproduce a small verified slice of wallet activity and store one useful research record end to end.

### V1 — Reliable personal ledger

- Add repeatable wallet sync, normalization, asset metadata, prices, holdings, and transaction history.
- Implement basic swap/trade classification, cost basis, realized/unrealized P&L, and reconciliation tools.
- Provide a simple portfolio and activity dashboard with data-quality warnings.

**Exit condition:** current holdings and representative historical trades reconcile closely enough for routine personal use, with exceptions clearly flagged.

### V2 — Research and narrative workflow

- Add ticker/contract intake, source adapters, evidence capture, structured synthesis, and report versioning.
- Add narrative records, candidate links, watchlists, review dates, and research freshness indicators.
- Keep scoring provisional until the separate strategy document is defined.

**Exit condition:** a candidate can move through a repeatable, source-backed research process and be revisited later without losing context.

### V3 — Strategy-aware decision support

- Encode the separately approved allocation, scoring, risk, and sizing rules as versioned configuration.
- Combine research results with live portfolio exposure to produce explainable recommendations.
- Record user decisions, overrides, and later outcomes.

**Exit condition:** recommendations are reproducible, attributable to explicit rules, and never trigger execution.

### V4 — Analytics and refinement

- Add richer performance attribution, cohort/setup analysis, benchmarks, and post-trade review.
- Track whether research scores, narratives, and sizing decisions predict outcomes.
- Improve providers, models, UX, and calculations based on observed failure modes.

**Exit condition:** the system measurably supports better process discipline and exposes which rules deserve revision.

## Feedback Loop

```text
Narrative or idea
      ↓
Structured research → user decision → on-chain activity → portfolio/performance
      ↑                                                    ↓
      └──────────── reviews, outcomes, and lessons ─────────┘
```

Each completed or rejected idea should strengthen the system. Reviews should distinguish outcome quality from decision quality, identify which evidence mattered, and propose changes to the strategy or research process. Rule changes should be versioned and applied prospectively so historical results are not rewritten with hindsight.

## Principles and Guardrails

- **Human-controlled execution:** no transaction building, signing, submission, or private-key storage.
- **Rules before recommendations:** AI gathers and synthesizes; explicit strategy rules govern scoring and sizing.
- **Evidence over confidence:** cite sources, dates, gaps, and contradictions; do not present unsupported certainty.
- **On-chain truth with reconciliation:** preserve raw chain data, make calculations reproducible, and flag ambiguous activity.
- **Contract-first identity:** never rely on ticker symbols alone.
- **Security by design:** use read-only public addresses and least-privilege credentials; keep secrets out of the repo and logs.
- **Data freshness is visible:** stale prices, narratives, research, or sync state must be obvious.
- **Manual override with history:** corrections and decisions are allowed, but never erase the original record.
- **Incremental delivery:** validate a narrow, trustworthy ledger before expanding automation or visual polish.
- **No false precision:** use ranges and confidence levels where inputs or classifications are uncertain.
- **Process over prediction:** evaluate discipline, evidence, and rule adherence alongside returns.

## Separate Strategy Document (Future)

A second document will be created after further discussion. It will contain the actionable investment framework that this system consumes, including:

- capital buckets and target allocation ranges;
- treatment of core holdings, dry powder, medium-term positions, memes/microcaps, and perps;
- portfolio-level risk and concentration limits;
- position-sizing and deployment rules;
- the detailed token research checklist and category-specific criteria;
- scoring, confidence, investability thresholds, and disqualifiers;
- entry, invalidation, exit, and review rules; and
- rules for revising the framework over time.

Until that document exists and is approved, the software should support structured research and tracking but avoid presenting provisional scores or sizing heuristics as settled policy.

## Build-Session Starting Point

The future Codex build session should begin by validating Robinhood Chain access against a small, known wallet-history sample and converting this concept into technical decisions. The first implementation priority is trustworthy, auditable data—not full automation or dashboard breadth. Open choices such as providers, persistence layer, price sources, cost-basis method, application stack, hosting, and privacy model should be resolved during that session with V0 kept deliberately small.
