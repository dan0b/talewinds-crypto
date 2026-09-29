# packages/portfolio

Answers "what do I own, what is it worth, and how did I get here?" for **owned** accounts only.
**Empty until V0a.** Design: [ADR 0002](../../docs/adr/0002-ledger-truth-and-reconciliation.md).

## Planned progression

- **V0a:** current balances + valuations per owned account, with prices and data freshness.
- **V1:** decoders turning raw records into canonical events → lots → cost basis →
  realized/unrealized P&L → reconciliation against observed balances.

## Rules

- **Accounting-grade.** Numbers must reconcile; anything uncertain is flagged, never smoothed
  over.
- **Owned accounts only.** Tracked/observed accounts belong to `investigation`.
- **Never guess:** undecodable activity becomes `unclassified`, and every P&L figure depending on
  it is marked incomplete.
- **Internal moves are not disposals.** Transfers between owned accounts (including bridges and
  CEX ↔ wallet) carry cost basis across.
- **Derived state is recomputable** from raw records at any time; store derivations as snapshots,
  never as the only copy of the truth.
- **Every valuation carries price source + timestamp,** and stale prices are visibly stale.
- **Exact math only** (`RawAmount`/`Dec`).
- **Test calculations with fixtures** of real (anonymized) activity, including edge cases: bridges,
  fees paid in a different asset, partial fills, airdrops, spam tokens.
