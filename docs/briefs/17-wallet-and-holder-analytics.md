# 17 — Wallet & holder analytics

- **Phase:** V2 — Always on, always aware
- **Status:** Draft
- **Depends on:** [16 Tracked wallets](16-tracked-wallets.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

Dissect profitable wallets' strategies to learn their edge, and investigate the big holders of any
token.

## Scope

- Round-trip reconstruction for tracked wallets. This is analytics-grade, and labeled as
  approximate.
- **Strategy breakdown:** win rate, typical multiple, hold time, entry timing relative to launch,
  position sizing, plus an AI-written summary of the pattern.
- **Per-token big-holder view:** top holders, their labels, recent activity, and suspicious patterns
  (coordinated selling, fresh wallets, shared funders).
- Optional: discover wallets that were early in several winners.

## Acceptance criteria

- [ ] A strategy breakdown matches a manual check on sampled trades.
- [ ] Holder views show every label with its source and confidence.
