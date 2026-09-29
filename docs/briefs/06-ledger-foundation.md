# 06 — Ledger foundation: venue fills → events, lots, cost basis, P&L

- **Phase:** V1 — Trust the numbers, deepen research
- **Status:** Planned
- **Depends on:** [02 Venue balances](02-venue-balances.md)
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Build the canonical event model and the accounting engine (lots, cost basis, realized and
unrealized P&L) using the cleanest data first: Hyperliquid and Coinbase, whose APIs return
structured fills.

## Why

This separates two hard problems. Once the accounting engine is proven on clean venue fills, any
mismatch after on-chain decoding (07) is added is a decoding problem, not an accounting one
([ADR 0002](../adr/0002-ledger-truth-and-reconciliation.md)).

## Scope

**In**

- **Decisions first (ADRs):** the cost-basis method (proposal: FIFO by default, with others
  computable later) and history depth (full history vs from a start date).
- **Tables**
  - `events`: canonical and chain-agnostic, linked to raw records, with a classification and
    confidence; `unclassified` is allowed.
  - `lots`: acquisitions with remaining quantity and cost basis.
  - Realizations.
- **Hyperliquid:** spot and perp fills, funding payments, deposits and withdrawals, liquidations.
  Perp P&L is realized on close, with funding as its own P&L component.
- **Coinbase:** fills, conversions, deposits and withdrawals, fees.
- **Engine:** deterministic, so replaying the same events always produces the same lots and P&L.
  Exact math. Fees are handled whichever asset they're paid in.
- **Manual corrections:** reclassify an event with an audit trail; the original is kept.
- **Dashboard:** trade history per venue, realized and unrealized P&L per asset, funding totals.

**Out**

- On-chain decoding (07); matching moves between sources (08).

## Acceptance criteria

- [ ] Venue P&L reconciles with each venue's own reports within a stated tolerance.
- [ ] Recomputing from scratch gives identical results.
- [ ] Corrections never erase the original event.

## Open questions

- Cost-basis method and history depth (both decided at the start of this step).
