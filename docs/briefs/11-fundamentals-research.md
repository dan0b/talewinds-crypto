# 11 — Fundamentals research

- **Phase:** V1 — Trust the numbers, deepen research
- **Status:** Planned
- **Depends on:** [05 Full research report](05-full-research-report.md) (and
  [10](10-robinhood-chain-research.md) for Robinhood Chain tokens)
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Every token that isn't a memecoin gets a fundamentals section: team, product, tokenomics and
unlocks, traction, competitors, and catalysts. Each claim is sourced and labeled as either a project
claim or a verified fact.

## Why

You want fundamentals in every analysis except memecoins and junk, and they matter most for your
medium- and longer-term Robinhood Chain plays ([ADR 0011](../adr/0011-research-scope.md)).

## Scope

**In**

- Web research via `generate` with a web search tool (verify current AI SDK and provider support),
  plus fetching the project's site, docs, and whitepaper.
- On-chain verification where possible, e.g. treasury or vesting-contract holdings compared with the
  stated tokenomics.
- Claims vs facts labeling; every claim carries its URL and fetch time.
- Gated by `token_type`: memecoins skip the section, with the reason shown.
- Per-report cost caps.

## Acceptance criteria

- [ ] For a sample of real project tokens, every fundamentals claim is sourced and labeled.
- [ ] Memecoins skip fundamentals, with the reason visible.
- [ ] Cost stays within the per-report cap.
