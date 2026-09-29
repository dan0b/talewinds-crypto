# 03 — Quick research report: Solana

- **Phase:** V0b — Contract address → research report
- **Status:** Ready
- **Depends on:** [01 Wallet balances](01-wallet-balances.md) (adapter plumbing, assets). Can run in
  parallel with 02.
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Paste a Solana mint address on the Research page. A background job runs, and a structured `quick`
report appears within seconds covering identity, market, holders, and security. No LLM calls.

## Why

This is the first half of V0b. It establishes the report model, the section framework, and the
sources-and-gaps presentation that every later research feature builds on
([ADR 0011](../adr/0011-research-scope.md)).

## Scope

**In**

- **Tables**
  - `research_reports`: asset, depth, status, version, requested_at, completed_at, cost summary.
  - `report_sections`: report, section key, status, data (validated by the section's Zod schema),
    sources `[{ provider, url, fetched_at }]`, gaps `[{ field, reason }]`.
  - Re-running a report creates a new version; old versions stay viewable.
- **Section framework** (`packages/research`): each section is an independent module with a `key`,
  its inputs, and `collect(context)`, which returns validated data plus sources and gaps. A failing
  section is marked failed with a reason; the report still completes.
- **Sections**
  - *Identity:* mint, name/symbol/decimals, metadata, creation time, token program (Token vs
    Token-2022) and risky Token-2022 extensions (e.g. permanent delegate, transfer hooks, transfer
    fees), and a ticker-collision check.
  - *Market:* price, market cap, FDV, liquidity, 24h volume, pools/DEXes, pair age.
  - *Holders:* top holders and concentration (top 10 / top 20 share), excluding known program and
    pool accounts.
  - *Security:* mint authority, freeze authority, whether LP is locked or burned, and a third-party
    safety report summary (e.g. RugCheck).
- **Job:** `research.run` with `{ asset, depth }`, reporting progress per section.
- **API:** `POST /api/research` (enqueue), `GET /api/research/:id` (status and sections),
  `GET /api/research` (recent reports).
- **Dashboard:** the input is enabled and validates a Solana address; progress shows live; the
  finished report shows each section with its sources, timestamps, and gaps, plus a drill-down to
  the raw data.
- **Cost lines:** API request counts (there's no LLM spend at this depth).

**Out**

- Insider analysis (04); AI synthesis and token type (05); Robinhood Chain (10); fundamentals (11).

## Approach notes

- Solana's `getTokenLargestAccounts` returns only the 20 largest token accounts. That's enough for
  concentration, not for a holder count, which needs an indexer. If none is available, show the
  holder count as a gap.
- Candidate providers: DexScreener, GeckoTerminal, or Birdeye for market data; Helius for parsed
  data; RugCheck for safety summaries. Verify free-tier limits.

## Acceptance criteria

- [ ] A real Solana token produces a quick report with all four sections in under about 30 seconds
      on free tiers.
- [ ] Every value shows its source and timestamp. Anything missing appears as a gap with a reason,
      never as zero or blank.
- [ ] Re-running produces version 2, and version 1 remains viewable.
- [ ] An invalid or nonexistent mint returns a clear error.
- [ ] Sections are independent: each lives in its own module, and one failing doesn't fail the
      others (demonstrated in a test).

## Open questions

- Primary market-data provider (DexScreener vs Birdeye), given free-tier limits.
- When does a report count as stale?
