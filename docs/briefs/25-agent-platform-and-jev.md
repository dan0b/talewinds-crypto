# 25 — Agent platform & Jev

- **Phase:** Priority 2 — Agentic trading
- **Status:** Draft
- **Depends on:** [24 First live agent](24-first-live-agent.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

Run several strategies safely, and qualify Jev (or reject it) on evidence rather than claims.

## Scope

- Multiple agents, each with its own budget and limits, plus portfolio-level limits across all of
  them.
- A strategy lifecycle: paper → small live → scaled.
- A **`decide` evaluation harness:** labeled datasets and calibration measurement, used to qualify
  Jev vs Claude per task ([ADR 0010](../adr/0010-ai-generate-and-decide.md)).
- A risk dashboard across all agents.

## Acceptance criteria

- [ ] Jev is qualified or rejected per task, based on measured calibration.
- [ ] Concurrent agents never breach portfolio-level limits.

## Note

The evaluation harness can be pulled forward as soon as Jev access arrives. It doesn't need to wait
for agents.
