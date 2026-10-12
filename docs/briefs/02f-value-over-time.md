# 02f — Portfolio value over time

- **Phase:** V0a — What do I own
- **Status:** ✅ Done
- **Depends on:** [01b Portfolio overview](01b-portfolio-overview.md),
  [02 Venue balances](02-venue-balances.md)
- **Written:** 2026-10-09
- **Build log:** [`2026-10-09-value-over-time`](../build-logs/2026-10-09-value-over-time.md)

## Goal

A chart of the portfolio's total value over time, just below the stat tiles. It covers all wallets
or one, over 1 day, 1 week, 1 month, or everything recorded.

## Why

The page says what you own now; you also want to see how the total has moved. Every sync already
keeps its balances, and every price refresh keeps its prices. So the history can be rebuilt from
what's stored, back to the first sync on 2026-09-28, instead of starting empty.

## Scope

**In**

- **The value at a moment is what the dashboard would have shown then:** each account's newest
  usable balances at that time, times each asset's newest price at that time, counting the assets
  that are verified now ([ADR 0021](../adr/0021-value-history-replayed.md)).
- **Points sit on a regular grid:** 15 minutes for 1D, 1 hour for 1W, 4 hours for 1M, and coarser
  for All. A final point at now equals the "Total value" tile.
- **Gaps, not guesses.** Where nothing synced (the laptop was asleep), the line breaks.
- **Wallets added along the way are marked.** A wallet's arrival is a step up, not a gain, so it
  gets a marker on the chart and a line under it with its value when it was added. The change over
  a range is shown only when no wallet was added during it.
- **Value, not performance.** The chart says that deposits, withdrawals, and added wallets move it
  too. P&L stays in step 09.
- **API:** `GET /api/portfolio/history?range=1d|1w|1m|all&wallet=<id>`.
- **Chart:** a crosshair tooltip and a table view.

**Out**

- P&L, cost basis, and flows (steps 06–09), including separating deposits from gains.
- History per coin, category, or wallet inside the chart.
- History of removed wallets: removing a wallet deletes its snapshots ([02d](02d-remove-a-wallet.md)).

## Approach notes

- A pure `buildValueHistory` and a loader, `getValueHistory`, live in
  `packages/portfolio/src/history.ts`, like holdings.
- Load only what the grid needs. Per account, take the newest usable run in each grid step, plus
  the newest before the range. Per asset, take the newest price in each step, plus the newest
  before the range. Postgres `date_bin` with `DISTINCT ON` does this, so the load grows with the
  number of chart points, not the number of syncs.
- A grid point is drawn if some account in scope finished a usable sync within the step (at least
  the balance staleness window) before it. Otherwise it's a gap.
- Exact math (`Dec`, `RawAmount`); values travel as decimal strings. The chart turns them into
  numbers for geometry only.

## Acceptance criteria

- [x] The chart's last point equals the Total value tile, for all wallets and for one.
- [x] Times when nothing synced show as breaks in the line.
- [x] Wallets added within the range are marked and listed, and the range's change is hidden when
      there are any.
- [x] Tests:
  - [x] unit tests for the replay: grid, gaps, additions, verified-only, prices as of each time;
  - [x] an integration test for the per-step queries;
  - [x] API tests.
- [x] `pnpm check` passes, and the chart is checked in a browser.

## Open questions

- None.
