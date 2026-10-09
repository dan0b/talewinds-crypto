# Build log: 01b — Portfolio overview: allocation, small balances, 24h change

- **Date:** 2026-10-08
- **Brief:** [01b-portfolio-overview](../briefs/01b-portfolio-overview.md)

## Summary

The Portfolio page now opens with an overview for **all wallets or any one wallet** (chosen at the
top, kept in the URL): total value, 24h change, largest position, and top three, then an
**allocation** card (donut + table) that breaks the total down by asset, wallet, or chain.
Holdings under **$3** fold into one "Small balances" line per chain, still counted in every total.
Each position shows its **24h change**, measured against our own recorded price from the same
source a day earlier.

At build time (live data): $8,250.52 across 6 wallets. USDC 42.1%, LIT 33.3%, ETH on Robinhood
Chain 19.1%, SOL 2.8%, ETH on Ethereum 2.6%, and 9 small balances totalling $3.38. The 24h change
was −1.61%, covering $1,815 of the total (the rest is new to the database today).

## What was built

- **`packages/portfolio`**
  - `config.ts`: `smallBalanceUsd` ($3 by default) and `baselineToleranceMs` (90 minutes).
    `setup.ts` adds `PORTFOLIO_SMALL_BALANCE_USD` and `portfolioConfigFromEnv`, so the API, worker,
    and CLI read the same rules.
  - `holdings.ts`:
    - **Scope:** `walletId` limits balances, accounts, notices, and lists to one wallet. An unknown
      wallet throws `Unknown wallet …`. `walletOptions` lists every wallet with its total for the
      picker.
    - **Small balances:** each position and holding has a `small` flag. Chains and wallets get
      `smallCount`/`smallValueUsd`, and the view gets `small` (count, value, threshold).
    - **24h change:** `pickBaselines` finds, for each fresh price, the same source's observation
      nearest to 24 hours before it, within the tolerance (ties go to the older one).
      `change24h` per position and holding gives the %, USD, and baseline. `summarizeChange` sums a
      set of positions and reports what it covers. Values never come out as a negative zero.
    - **`buildOverview`:** allocation rows by asset (small balances folded into one row), by wallet
      (all-wallets scope only), and by chain, each with its share and 24h change. It also gives
      concentration (the largest position and the top three) and the unpriced count.
- **`packages/db`:** `priceObservationsBetween(assetIds, from, to)` for the baseline window. It
  uses the existing `(asset_id, priced_at)` index; no schema change.
- **`apps/api`:** `GET /api/portfolio/holdings?wallet=<uuid>`, which is validated and returns 404
  `wallet not found` for an unknown wallet. Config comes from `portfolioConfigFromEnv`.
- **`apps/web`**
  - **Scope picker** ("Showing: All wallets / <wallet> · $value"), stored as `/?wallet=<id>` through
    TanStack Router `validateSearch`. The previous scope stays on screen, dimmed, while the next one
    loads. A wallet ID that no longer exists falls back to all wallets.
  - **`Overview.tsx`:** stat tiles (value, 24h change with coverage, largest position, top three)
    and `AllocationCard` (By asset / By wallet / By chain). The table rows and donut slices
    highlight each other on hover, and every row has a share bar and its 24h change.
  - **`charts/Donut.tsx`:** inline SVG with no chart library. At most six slices (the top five plus
    "Other"), 2px gaps, and the center reads out the hovered slice. Validated palette in
    `styles.css` (`--color-series-1…5`, `--color-series-other`).
  - **Lists:** `WalletGroups` and `HoldingsTable` fold small balances into an expandable row
    ("Small balances (n) · each under $3, still counted in totals"), and add a **24h** column. A
    "Show small balances (n)" toggle sits next to "Show hidden".
  - `ui.tsx`: `Segmented` (a fieldset) replaces the page's own view toggle. Stat values use
    proportional figures. `format.ts`: `formatShare`, `formatChangePct`, `formatChangeUsd`,
    `direction`, and `shareFraction` (a share as a number, for chart geometry only).
- **Docs:** this step's brief, its roadmap row, glossary terms (small balance, scope, allocation,
  concentration, 24h change, baseline price), rules in `apps/web/CLAUDE.md` and
  `packages/portfolio/CLAUDE.md`, and `.env.example`.

## Deviations from the brief (and why)

1. **Colors follow rank within each chart, not the asset across wallets.** The brief planned to
   keep ETH's color when you switch wallets. The dataviz validator shows the palette is only
   color-blind safe as **neighbors in slot order**. Out of order, aqua and magenta merge for
   deuteranopes (ΔE 1.6), and orange and yellow are hard to tell apart for anyone (ΔE 10.6). Keeping
   an asset's color across scopes would put arbitrary pairs side by side, so each chart assigns
   colors largest first, and the table next to it names every color. The `rankedAssetIds` field
   added for that idea was removed.
2. **Donut slices respond to the mouse only.** The linter's accessibility rules don't allow
   focusable SVG paths with a fitting role. Keyboard and screen-reader users get the same values
   from the table beside the chart (documented with a lint exception in `Donut.tsx`).
3. **Chart colors are plain `:root` variables, not `@theme` tokens.** Tailwind v4 only emits theme
   variables it sees used in class names. The first render showed only series 1 (named in a comment)
   and "Other", which left most of the donut black. This was caught in the browser check and fixed.
4. **"Other" is a dark gray (`#4b515b`).** A mid gray failed next to magenta and aqua under
   simulated color blindness. The darker gray passes against all five colors. Its contrast with the
   card (2.27:1) is below 3:1, which the table view makes acceptable.
5. **The old "Wallets" tile is gone.** Its hint ("N chains · M incomplete · K failed") repeated the
   notices, which already show sync health and now follow the scope.

## Verification performed

- `pnpm check` passes: lint (160 files), boundaries, typecheck, **89 unit tests** (up from 70), and
  **20 integration tests** (up from 18).
- New tests:
  - **Unit (15, `holdings.test.ts`):** small-balance flags and threshold; allocation shares, folding,
    and the sum to 100%; by wallet and by chain; concentration; an empty portfolio; wallet scope;
    the picker options; unknown wallet; 24h baselines (same source, tolerance, ties, stale prices);
    coverage; negative zero.
  - **API (1):** the wallet parameter is passed through, an invalid ID gets 400, an unknown one 404.
  - **Web (3):** the new formatters.
  - **Integration (2):** 24h change end to end through `priceObservationsBetween` (a different
    source's old price is ignored), and wallet scoping through `getHoldings`.
- **In headless Chrome** against the live dev servers and your real data: the all-wallets view, one
  wallet (MM Acct 1), the By wallet and By chain breakdowns, hovering a slice (the center read
  "LIT · 33.3% · $2,748.30" and its row highlighted), and Show small balances (all nine listed, no
  folded rows left). Screenshots were checked visually; the first pass is where deviation 3 was
  caught.
- **Palette** checked with the dataviz validator on the app's surface (`#13161c`): the five slots
  pass in order, the wrap-around pairs pass (yellow↔blue, magenta↔blue), and "Other" passes against
  each slot.
- **Spot checks on your data:** LIT (Lighter, `0x232c…4ee2`) is $3.53 with us, $3.536 on DefiLlama
  (confidence 0.99), and $3.50 on DexScreener (Uniswap, $396K liquidity). Your position is about
  0.7% of the pool. USDC is Circle's contract (`0xa0b8…eb48`). The overview shares add up to 100%.

## Known gaps

- **24h change needs a recorded price from about 24 hours earlier** (same source, ±90 minutes).
  Holdings first seen today (USDC, LIT, ETH on Ethereum) show "—" until tomorrow. Times when the
  laptop slept show gaps too, until the worker runs around the clock (step 12).
- **The same coin on different chains is a separate slice** (ETH on Robinhood Chain and on Ethereum).
  The underlying grouping comes in step 02.
- The threshold is an env setting only (`PORTFOLIO_SMALL_BALANCE_USD`); there's no dashboard control.
- An asset can change color when you switch scope (deviation 1). The table always labels it.
- "Top 3" reads 100.0% when a scope has three positions or fewer, which is correct but obvious.
- Checked in headless Chrome only. **Please click through it once in your own browser.**
- Robinhood Chain tokens are still invisible until the network is enabled in Alchemy (unchanged).

## Next steps

1. **You:** enable Robinhood Chain Mainnet in your Alchemy app, and create the Coinbase view-only
   key (instructions in `.env.example`).
2. **Step [02](../briefs/02-venue-balances.md):** Coinbase first, then Hyperliquid, including the
   underlying grouping (one "ETH" across chains and venues).
