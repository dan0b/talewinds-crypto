# 01b — Portfolio overview: allocation, small balances, 24h change

- **Phase:** V0a — What do I own
- **Status:** ✅ Done
- **Depends on:** [01a Wallets, market data, and price accuracy](01a-wallets-and-market-data.md)
- **Written:** 2026-10-08
- **Build log:** [`2026-10-08-portfolio-overview`](../build-logs/2026-10-08-portfolio-overview.md)

## Goal

One screen shows how your money is spread out, for all wallets together or for any one wallet:

- **Allocation:** each asset's, wallet's, and chain's share of the total, as a donut chart with a
  table of exact values.
- **Concentration:** how much sits in your largest position and in your top three.
- **24h change:** how what you hold now moved in value over the last 24 hours, per position and in
  total.
- **Small balances stop cluttering the lists.** Anything worth less than $3 folds into one line.

## Why

You're onboarding every wallet and want to see sizing at a glance. Lists of positions don't show
proportions, and leftover dust (today: moin, a WBTC remnant, and four tokens worth $0.00) makes
them noisy. Allocation over time, P&L, and exposure by underlying need later steps (02, 06–09);
this step covers what the current balances and prices can already answer.

## Scope

**In**

- **Scope picker:** "All wallets" or one wallet. The page's totals, notices, overview, and lists
  all follow it, and the choice is kept in the URL.
- **Small balances:** a verified, priced holding worth less than the threshold ($3 by default,
  `PORTFOLIO_SMALL_BALANCE_USD`) folds into one "Small balances (n) · $x" line per chain in the
  wallet view, and one line in the by-asset view. A toggle shows them. Folding is display only:
  they still count in every total. Unpriced holdings are never small (their value is unknown).
  Hidden tokens (unverified, spam) work as before.
- **Allocation by asset, by wallet (All wallets only), and by chain:** a donut chart and a table
  (value, share, 24h change) with a toggle between the three. The donut shows at most six slices:
  the five largest, then "Other". The table lists everything, with small balances as one row.
  Unpriced assets aren't in the allocation, and the overview says how many there are.
- **Concentration:** the largest position's share of the total, and the top three's.
- **24h change of current holdings:** each position's price now against our own recorded price
  from about 24 hours earlier (same price source, within 90 minutes of the 24-hour mark). Totals
  per scope and per allocation row, in USD and %. It's a price move of what you hold now, not P&L:
  deposits, withdrawals, and trades don't count. A position with no baseline shows "—", and totals
  say how much of the value they cover.
- **Chart conventions:** the first chart in the app sets a categorical palette (design tokens in
  `styles.css`, validated for color-blind safety on the dark surface). Colors are assigned by rank
  within each chart. (The brief first said colors would follow the asset across wallets; the
  palette fails the color-blind checks for out-of-order neighbors, so that was dropped while
  building. See the build log.)

**Out**

- Counting the same coin across chains and venues as one (ETH on Ethereum + Robinhood Chain +
  Coinbase): step 02 adds the **underlying** grouping. Until then, ETH on each chain is its own
  slice.
- Allocation by narrative or theme: a later narrative-tags step (part of 14 today).
- Value history and charts over time: step 09.
- Cost basis and P&L: steps 06–08.
- Editing the small-balance threshold in the dashboard (it's an env setting for now).
- Exit liquidity and cash vs. risk metrics: not chosen for now.

## Approach notes

- All math lives in `packages/portfolio` (pure, exact `Dec`), and the API emits decimal strings.
  Shares are fractions (`"0.661234"`); the web turns a share into a number only for SVG
  geometry, never for money.
- Scope is a query parameter (`/api/portfolio/holdings?wallet=<id>`). The response also carries
  every wallet's name and total for the picker.
- 24h baselines: one query for the held assets' price observations in the window around the
  24-hour mark, then a pure function picks the nearest same-source observation. Only current
  (non-stale) prices get a change.
- Donut chart: inline SVG, no chart library. Following the dataviz guidance: at most 6 segments,
  2px gaps between them, a legend (the table), a hover tooltip, and a table view of every value.

## Acceptance criteria

- [x] Choosing a wallet scopes the totals, notices, overview, and lists to that wallet. "All
      wallets" shows everything, and a reload keeps the choice.
- [x] Each breakdown's shares add up to 100% of the scope's priced total (display rounding aside).
      Small balances appear as one slice or row.
- [x] Holdings under the threshold are folded by default and listed on demand. Totals are the same
      either way.
- [x] A position's 24h change equals price now ÷ baseline price − 1, with both prices from the same
      source. Positions without a baseline show "—", and totals state their coverage.
- [x] The largest-position and top-three shares match the allocation table.
- [x] Unit tests cover allocation, small balances, concentration, and baseline selection. An API
      test covers the wallet scope parameter.
- [x] Checked in the browser against current data.

## Open questions

- ~~Which extra metrics?~~ Concentration and 24h change (you chose them on 2026-10-08).
- ~~Do small balances count in totals?~~ Yes. Folding is display only, so totals stay exact.
