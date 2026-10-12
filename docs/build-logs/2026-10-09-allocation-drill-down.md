# Build log: 02e — Allocation drill-down and a tidier portfolio page

- **Date:** 2026-10-09
- **Brief:** [02e-allocation-drill-down](../briefs/02e-allocation-drill-down.md)

## Summary

The allocation card shows every coin worth at least 0.1% of the total as its own slice. Eleven coins
do today, and the ten under 0.1% fold into one "Other" row that opens. Any slice or row with
something inside opens into its own donut and table:

- a category, theme, wallet, or chain opens to its coins;
- a coin opens to where it's held;
- Other opens to what it folds.

Back and a breadcrumb return. The theme view has a donut, with ZEC counted once as "Privacy +
Quantum" ([ADR 0020](../adr/0020-theme-allocation-by-combination.md)). Wallet cards collapse to a
one-line summary, and notices can be hidden. Both are remembered in the browser.

## What was built

- **Portfolio (`buildOverview`).** Every allocation row now carries a `breakdown`: what the row is
  made of, already folded, with `share` of that row and `totalShare` of the scope. This replaces
  `parts`.
  - **Folding.** Rows under `allocationOtherBelowShare` (0.1%, in `PortfolioConfig`) fold into an
    `other` row, but only when at least two qualify and one row stays out. Uncategorized and No
    theme never fold. The overview reports the threshold as `otherBelowShare`.
  - **Themes** group coins by their full set of themes (key `t1+t2`, label "A + B"), so the theme
    view adds up to 100%.
  - **Wallet and chain rows** open to their coins. A chain merges the same asset across wallets.
  - **Wallet groups** gain `share` and `change24h` for the collapsed header.
- **Dashboard.**
  - `AllocationCard` keeps a drill path of row keys, so it survives a refresh, and falls back
    gracefully when a row disappears. A drilled view shows Back, a breadcrumb, the group's value
    and its share of the total, and a "% of total" line under each row. Rows and slices with
    something inside show a `›` and open on click. A row's name is a button, which is the keyboard
    path. Coin rows keep their tags and the tag editor at every level, so you can open
    Uncategorized and tag from there.
  - `Donut`:
    - one slice per row, since the server folds now;
    - eight colors;
    - hover targets at least 12px wide, so thin slices can still be hovered;
    - click-to-open.
  - Notices have a × and "Hide all". A "N hidden · Show" line stays when any are hidden.
  - Wallet cards collapse from the chevron or by clicking the header. A collapsed card shows its
    name, family, address, chains, asset and hidden counts, sync problems, value, share, and 24h
    change. Collapse all / Expand all sits in the holdings toolbar.
  - `lib/storage.ts`: per-browser conveniences with guarded reads and writes, and stored values
    checked on read.
- **Chart colors:** series 6–8 (green, violet, red) from the dataviz reference palette, dark steps.

## Deviations from the brief

- **Hidden notices come back when their facts change, not when their wording does.** Several
  notices quote live dollar amounts ("≈ $51.76"), which change every sync, so keying on the text
  would bring them back every 15 minutes. Each notice instead carries a signature: its counts, the
  failed accounts, or the order of magnitude of the low-confidence value.
- **A chart never ends on series 7.** The validator showed violet (7) next to blue (1) fails even
  for full-color vision. A ring's last slice touches its first, so a chart with exactly seven
  colored slices draws the seventh in gray. Every other closing pair passed.
- **The inline "where it's held (▸ 3)" expansion on coin rows was replaced by opening the coin.**
  That keeps one way to look inside anything.
- **Two layout fixes found while checking at phone width:**
  - The page scrolled sideways on a 390px screen. Visually hidden table-header labels ("Details",
    "Open") are positioned absolutely and escaped their scrolling table wrappers. This predates
    this step. The wrappers are now `relative`.
  - Card headers now wrap their controls.

## Verification performed

- **Unit tests** (`holdings.test.ts`, 26):
  - every coin down to 0.1%, and a single small row never folding alone;
  - Other folding and opening, with shares of Other and of the total;
  - never folding every row;
  - wallet and chain breakdowns;
  - wallet-group share and 24h change;
  - a category opening to its coins, which keep their tags;
  - themes by combination adding up to 100%;
  - holdings inside a coin.

  The Coinbase integration test now checks a venue's breakdown.
- **Palette:** `validate_palette.js` passes the eight colors in order on our surface (`#13161c`,
  dark): worst adjacent CVD ΔE 8.4, normal vision 19.3. It also checked every pair that closes the
  ring, and gray against all eight.
- **Live**, through the API and in headless Chrome at 1280px and 390px:
  - Asset view: eleven coins plus "Other (10 coins, each under 0.1%)".
  - Theme view: a donut with Privacy + Quantum.
  - Category → Major → ETH → its holdings, then Back and the breadcrumb.
  - Other, and a nested Other inside it.
  - Wallet view: the two FOMO wallets fold into Other.
  - Collapse all, opening one card, and a reload: both kept.
  - Hiding a notice and reloading: still hidden; "Show" brings it back.
  - No sideways scroll at 390px.
- `pnpm check` passes: **149 unit tests** and **34 integration tests** (with 02f).

## Known gaps

- Colors follow rank within each chart, so a coin can change color between views. The palette is
  only color-blind safe as neighbors in rank order, and the table beside every donut names each
  color.
- Slices respond to the mouse only; the table rows are the keyboard and screen-reader path.
- The drill-down resets on reload. Hidden notices and collapsed wallets are remembered in this
  browser only.
- A nested Other can hold dust worth $0.00, shown as such.
- Per-theme exposure (a coin counted in every theme) is no longer shown (ADR 0020).

## Next steps

- [02f Portfolio value over time](../briefs/02f-value-over-time.md), built alongside.
- Tag the coins under Uncategorized (USD, moin, QQQ, and others): open the row and use Tag.
