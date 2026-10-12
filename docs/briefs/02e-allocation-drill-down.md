# 02e — Allocation drill-down and a tidier portfolio page

- **Phase:** V0a — What do I own
- **Status:** ✅ Done
- **Depends on:** [01b Portfolio overview](01b-portfolio-overview.md),
  [02b Categories and themes](02b-categories-and-themes.md)
- **Written:** 2026-10-09
- **Build log:** [`2026-10-09-allocation-drill-down`](../build-logs/2026-10-09-allocation-drill-down.md)

## Goal

Make the portfolio page easy to read and get around, now that it covers ten wallets and venues.
You should be able to see every coin in the allocation, open any slice to see what's inside it,
collapse the wallets you aren't looking at, and hide notices you've already read.

## Why

Your feedback on 2026-10-09:

- The allocation donut lumped everything after the top five into "Other".
- The theme view had no donut.
- The wallet list is long.
- The notices at the top stay there after you've read them.

## Scope

**In**

- **Every coin gets a slice.** The donut shows every row worth at least 0.1% of the chart. Rows
  under that fold into one "Other" row, but only when two or more qualify; Other opens to show
  them. The table lists the same rows as the donut. This applies in every view. Uncategorized and
  No theme never fold.
- **Eight chart colors.** These are the dataviz reference palette's eight, validated on our
  surface; anything past them is gray.
- **A theme donut.** Each coin counts once, under its full set of themes ("Privacy + Quantum"), so
  the slices add up to 100% ([ADR 0020](../adr/0020-theme-allocation-by-combination.md)).
- **Drill-down.** Click a slice or a table row to see what's inside it, as its own donut and table,
  with Back and a breadcrumb:
  - a category, theme, wallet, or chain opens to its coins;
  - a coin opens to where it's held and in what form;
  - Other opens to the rows it folds.

  Shares inside a group are of that group, with each row's share of the total next to it. Coin rows
  keep their tags and the tag editor at every level.
- **Collapsible wallets.** Each wallet and venue card collapses to a header that shows its value,
  share, 24h change, chains, and asset count. Collapse all / Expand all. The choice is remembered
  in this browser.
- **Hideable notices.** Each notice has a hide button, and there's a Hide all. Hidden notices
  leave a "N hidden · Show" line. A hidden notice comes back by itself when what it says changes
  (for example, when another chain fails). Remembered in this browser.

**Out**

- Per-theme exposure, where a coin counts in each of its themes. Combinations replace it in the
  view; it can come back with narratives (step 14).
- Remembering the drill-down across reloads: the view opens at the top level.
- Collapsing chain sections inside a wallet.

## Approach notes

- Values, shares, the Other fold, and every breakdown are computed in `buildOverview`
  (`packages/portfolio`). The dashboard only draws them. Each allocation row carries a `breakdown`
  (its own rows, already folded, with shares of that row), which replaces `parts`.
- The threshold is `allocationOtherBelowShare` (0.001) in `PortfolioConfig`, and the overview
  reports it so the page can say "each under 0.1%".
- Wallet groups gain `change24h` and `share` (of the scope's total) for the collapsed header.
- Browser storage holds only per-viewer conveniences (collapsed wallets, hidden notices). Reads
  and writes are wrapped in try/catch, so the page works without it.

## Acceptance criteria

- [x] With today's portfolio, the asset donut shows every coin at or above 0.1% as its own slice.
      The coins under 0.1% are one Other row, which opens to list them.
- [x] The theme view has a donut. ZEC appears once, as Privacy + Quantum, and theme shares add up
      to 100%.
- [x] Clicking a category, theme, wallet, chain, coin, or Other (slice or row) drills in. Back and
      the breadcrumb return. Every drill-down adds up to its group's total.
- [x] Wallet cards collapse and expand one at a time and all at once, and stay that way after a
      reload.
- [x] Each notice can be hidden. A hidden notice reappears when its text changes, and "Show"
      brings hidden ones back.
- [x] Unit tests cover the fold, the combinations, and the breakdowns. `pnpm check` passes, and
      the page is checked in a browser.

## Open questions

- ~~How should the theme donut count a coin with several themes?~~ Once, as a combination (you
  chose this 2026-10-09).
