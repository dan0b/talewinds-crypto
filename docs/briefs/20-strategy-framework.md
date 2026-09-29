# 20 — Strategy framework as versioned data

- **Phase:** V3 — Strategy-aware decisions
- **Status:** Draft
- **Depends on:** a planning session to write the strategy document;
  [09 Risk & performance dashboard](09-risk-and-performance-dashboard.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

Your investment framework becomes explicit, versioned data that the platform can apply, instead of
living in your head.

## Scope

- **Planning session first:** write the strategy document, which doesn't exist yet. It covers:
  - capital buckets and target ranges (core, dry powder, medium-term, memes/microcaps, perps);
  - risk and concentration limits;
  - position sizing and deployment rules;
  - the research checklist and scoring;
  - disqualifiers;
  - entry, invalidation, exit, and review rules;
  - how the framework itself gets revised.
- A Zod schema for strategy rules, an immutable `strategy_versions` table, and an editor with a
  diff view ([ADR 0007](../adr/0007-postgres-single-source-of-truth.md)).

## Acceptance criteria

- [ ] The strategy is stored as a version, and every edit creates a new version with a visible diff.
- [ ] Nothing presents scores or sizing as policy until a version is approved.
