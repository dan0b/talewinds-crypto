# 15 — Alerts & Telegram

- **Phase:** V2 — Always on, always aware
- **Status:** Draft
- **Depends on:** [12 Deploy](12-deploy.md), [13 Research workflow](13-research-workflow.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

What matters reaches you, and ideas can be captured from your phone
([ADR 0004](../adr/0004-interfaces-and-capabilities.md)).

## Scope

- **Alert rules:** price moves, portfolio drawdown, a thesis invalidation condition being hit, new
  red flags on watched tokens, sync failures or a worker going down. Later: tracked-wallet buys
  (16).
- A **Telegram bot that responds only to your chat**.
- `/research <CA>` returns a quick-report summary plus a link to the full report on the dashboard;
  `/status` reports system health.
- Deduplication, rate limiting, and quiet hours.

## Acceptance criteria

- [ ] Alerts arrive within a stated delay of the event that triggered them.
- [ ] The bot ignores every chat except yours.
- [ ] `/research` returns a summary and a working dashboard link.
