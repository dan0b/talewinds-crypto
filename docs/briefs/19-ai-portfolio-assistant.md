# 19 — AI portfolio assistant

- **Phase:** V2 — Always on, always aware
- **Status:** Draft
- **Depends on:** [09](09-risk-and-performance-dashboard.md), [13](13-research-workflow.md),
  [14](14-narratives-and-theses.md) (and [18](18-news-aggregation.md), which improves it)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

AI helps you manage the portfolio: you can ask questions of your own data, and you get a proactive
daily briefing.

## Scope

- An **MCP server** exposing read-only capabilities (holdings, exposure, P&L, reports, theses,
  watchlist), so Claude can answer "what's my RWA exposure?" with real numbers
  ([ADR 0004](../adr/0004-interfaces-and-capabilities.md)).
- A **daily briefing** job: what changed, risks, stale theses, upcoming catalysts, notable
  tracked-wallet activity. Delivered on the dashboard and via Telegram.
- In-dashboard chat, but only if the MCP route proves insufficient.

## Acceptance criteria

- [ ] Claude answers portfolio questions through MCP with correct numbers.
- [ ] The briefing arrives daily, and every claim in it links to its data.
- [ ] Everything is read-only.
