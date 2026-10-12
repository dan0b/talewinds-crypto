# Build log: 02f — Portfolio value over time

- **Date:** 2026-10-09
- **Brief:** [02f-value-over-time](../briefs/02f-value-over-time.md)

## Summary

A "Value over time" chart sits under the stat tiles, for all wallets or the selected one, over 1D,
1W, 1M, or All. It's replayed from stored balance snapshots and prices, so it reaches back to the
first sync on 2026-09-28. Nothing new is stored
([ADR 0021](../adr/0021-value-history-replayed.md)). Its last point equals the Total value tile
($40,734.80 when checked). The chart shows:

- breaks where nothing synced;
- dashed stretches where a sync couldn't see every balance;
- a ring where a wallet was added;
- the range's change only when that change means something.

## What was built

- **Database:** four repo functions in `packages/db/src/repos/portfolio.ts`.
  - `usableRunsPerStep` and `pricesPerStep` keep the newest run or price per account or asset in
    each grid step (`date_bin` + `DISTINCT ON`), plus the newest before the range. The load grows
    with chart points, not with syncs.
  - `snapshotsOfRuns`.
  - `firstUsableRunAt`.
- **Portfolio:** `packages/portfolio/src/history.ts`.
  - `buildValueHistory` (pure) replays the scope's value at each grid time. It uses each account's
    newest usable run finished by then and each asset's newest price by then, counts assets
    verified now, and rounds like the holdings view.
  - `getValueHistory` loads only what the grid needs.
  - `historyWindow` and `historyGrid` cover the steps: 15 minutes for 1D, 1 hour for 1W, 4 hours
    for 1M, and up to 200 points for All.
  - The response carries:
    - points, null for gaps, each with `incomplete`;
    - `additions`, the wallets that first synced inside the range, with the size of their step;
    - `trackedSince`;
    - a summary: start, end, high, low, and the change, null unless it's comparable.
- **API:** `GET /api/portfolio/history?range=1d|1w|1m|all&wallet=<id>`. It's Zod-validated,
  returns 404 for an unknown wallet, and defaults to `1w`.
- **Dashboard:**
  - `charts/TimeSeries.tsx`, a reusable single-series line (dataviz specs):
    - a 2px line with a 10% wash, and a hairline grid;
    - "nice" y ticks and local-time x ticks;
    - breaks at gaps, with lone points drawn as dots;
    - dashed uncertain stretches and hollow event markers;
    - a crosshair that snaps to the nearest point, with an HTML tooltip.
  - `portfolio/ValueHistory.tsx`:
    - range buttons, remembered in this browser;
    - the change, or why it isn't shown;
    - high and low, and the additions and dashed legends;
    - "Value, not performance";
    - a table view.

    It refreshes whenever the holdings do, so its last point stays equal to the tile.

## Deviations from the brief

- **Partial syncs are flagged (`incomplete`).** Your Robinhood Chain syncs were `partial` until
  Alchemy enabled the network on 2026-10-08 (17:30 UTC), so the line before then leaves out HOOKR,
  V4, and PARE. That jump is neither a gain nor a new wallet. Those stretches are dashed, and the
  range's change is withheld when its start or end is incomplete.
- **`trackedSince` was added.** When tracking began inside the range (1M, or a newly added wallet),
  the axis starts there and says "History starts …", instead of leaving most of the chart empty.
- `pricesPerStep` has no upper bound, so a price stamped slightly in the future still counts as the
  newest, as `latestPrices` treats it. The `date_bin` stride is written into the SQL, because
  `DISTINCT ON` needs the expression and `ORDER BY` to match, and two bound parameters never do.

## Verification performed

- **Unit tests** (`history.test.ts`, 12):
  - the 1D grid, and not repeating `now` when it falls on a boundary;
  - All's step choice, and the empty case;
  - prices as of each time, verified-only, and holdings-style rounding;
  - gaps;
  - no value before tracking;
  - `trackedSince`;
  - incomplete stretches withholding the change;
  - a venue scope, and an unknown wallet;
  - an addition grouped across two chains, with its step;
  - venue naming.
- **Integration tests** (`history.int.test.ts`, 4):
  - the per-step queries, including that failed runs never count and partial runs say so;
  - prices stamped after `now`;
  - the final point equal to `getHoldings` for all wallets and for one.

  **API tests:** range and wallet passed through, 400 for a bad range, 404 for an unknown wallet.
- **Live:** the last point equalled the holdings total. 1D answered in about 100 ms, All in about
  30 ms.
- **Headless Chrome** at 1280px and 390px:
  - 1D, 1W, 1M, and All;
  - the tooltip at a point, at "now", and over a gap ("No sync");
  - the table view;
  - MM Acct Store as the scope;
  - no sideways scroll on a phone.
- `pnpm check` passes: **149 unit tests** and **34 integration tests** (with 02e).

## Known gaps

- **Value, not performance.** Deposits, withdrawals, and added wallets move the line. P&L needs the
  ledger (06–09).
- **Recent additions:**
  - For now, 1D, 1W, and All include the wallets you added on Oct 8–9, so they show steps and no
    change. 1D is clean once those additions fall out of it (from about 8:30 PM on Oct 9).
  - Before Oct 8 the line is dashed (Robinhood Chain partial).
- **Gaps** appear wherever the laptop slept. Always-on hosting (step 12) closes them.
- **Today's rules apply to all of history:** a token you verify later counts throughout, and a
  removed wallet disappears from history.
- **Mouse-only chart:** the crosshair works with the mouse only; the table view is the keyboard
  path.
- **Cost per request:** history is computed on each request. That's fast today; a cache that can be
  rebuilt can come later if needed.
- **Old data, not investigated:** the earliest All points swing from $4,785 to $1,371 between
  04:00 and 08:00 UTC on Sep 29. That's real data from the small wallets.

## Next steps

- Step 03 (quick research report), per the roadmap.
- Later: value per wallet or coin over time, and P&L over time (09).
