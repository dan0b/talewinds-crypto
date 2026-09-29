# 0007 — Postgres is the single source of truth

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

The original brief imagined a file-based repo (`narratives/`, `research/`, `data/raw/` as files in
git). With a dashboard that should eventually hold everything, files and a database would become
two sources of truth that drift.

## Decision

- **Everything lives in Postgres:** ledger data (raw records, events, prices, positions) *and*
  knowledge (narratives, theses, research reports, decisions, reviews).
- **Raw provider responses** are stored immutably (JSONB) in Postgres; they can move to object
  storage later if volume demands.
- **History is append-only where beliefs change.** Narratives, reports, and decisions get revision
  history rather than in-place overwrites.
- **Strategy rules are versioned data too:** `strategy_versions` rows are immutable; an edit
  creates a new version; every recommendation pins the version that produced it, so history is
  never rewritten with hindsight. (An earlier proposal to keep strategy rules in git was dropped.)

## Consequences

- One exception is flagged for priority 2: **execution hard limits** (per-trade cap, daily loss
  limit, kill switch) are a security boundary, not knowledge. A bug or prompt-injected agent with
  database write access must not be able to raise its own limits, so those limits must not be
  writable by the running app (e.g. deploy-time config). Decided when execution is built.
- Schema changes go through reviewed, committed Drizzle migrations.
