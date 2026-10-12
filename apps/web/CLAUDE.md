# apps/web

The dashboard — home base for everything ([ADR 0004](../../docs/adr/0004-interfaces-and-capabilities.md)).
A Vite + React single-page app that talks only to the API.

- `src/router.tsx` — layout, nav, and route tree (TanStack Router, code-based).
- `src/routes/*.tsx` — one file per page.
- `src/components/portfolio/` — the Portfolio page's parts: `Overview` (stat tiles and the
  allocation card, whose slices and rows open into their `breakdown` with Back and a breadcrumb),
  `ValueHistory` (value over time, step 02f), `WalletGroups` (wallet → chain, the default; cards
  collapse to their header), `HoldingsTable` (by asset), `AddWallet`, shared table `cells`,
  `SyncBadge`, `Tags` (the coin tag editor and tag manager). Venue accounts (Coinbase) render as a
  wallet-style card with one section. The page's scope (all, one wallet, or one venue account) lives
  in the URL: `/?wallet=<id>`.
- `src/components/charts/` — charts: `Donut` and `TimeSeries` (a single-series line with gaps,
  dashed uncertain stretches, event markers, and a crosshair). Inline SVG, no chart library.
- `src/lib/storage.ts` — per-browser conveniences (collapsed wallets, hidden notices, the chart's
  range), with guarded reads and writes.
- `src/lib/api.ts` — the typed API client (`hc<AppType>`). Route paths and response types come from
  `apps/api`, with no hand-written types.
- `src/components/` — shared UI. `src/styles.css` — Tailwind + design tokens.
- Dev server: http://localhost:5173, proxying `/api` to the API on :3001.

## Rules

- **This code runs in the browser.** It may depend only on `@talewinds/core` and, **type-only**, on
  `@talewinds/api` (`import type`). Never import db, runtime, sources, ai, or anything
  server-side. `pnpm boundaries` enforces this.
- **All data comes through `api`** with TanStack Query (`useQuery`/`useMutation`). No other
  `fetch` calls. Use `okJson(res)` (or `okJson(res, 201)`) to get a route's typed success body;
  any other status throws with the API's own error message, which forms show as-is. Use
  `InferResponseType<…, 200>` for response types (see `src/lib/api.ts`). Never hand-write API types.
- **Format numbers with `src/lib/format.ts`** (exact decimal math for display). Never format with
  `parseFloat` or `toFixed` on a float.
- **Use semantic design tokens** (`bg-surface`, `text-muted`, `border-border`, `text-ok`, …) from
  `styles.css`, not raw palette colors, so the theme changes in one place.
- **Don't put two classes that set the same CSS property on one element** (e.g. `text-muted` and
  `text-fg`). The winner is decided by stylesheet order, not class order. For active/inactive
  states, use mutually exclusive `activeProps`/`inactiveProps`.
- **Make staleness and incompleteness visible.** Show data age, and flag `unclassified`/incomplete
  numbers rather than hiding them ([ADR 0002](../../docs/adr/0002-ledger-truth-and-reconciliation.md)).
- **Amounts arrive as strings.** Format them for display; never `parseFloat` them for math.
- **Charts:** turn a share into a number only through `shareFraction`, and a USD value only through
  `chartNumber` (lib/format), and only for geometry (angles, heights, bar widths). Colors come from
  the `--color-series-*` variables in `styles.css`, assigned **by rank within each chart** (largest
  = series 1), at most eight plus `series-other`: the palette passes the color-blind checks only as
  neighbors in that order. A donut's last slice touches its first, and series 7 fails next to 1, so
  a donut never ends on series 7 (`colorsOf` grays it). Every chart has a table with every value
  (beside a donut; a "Show table" view for a time series): the legend, and the keyboard and
  screen-reader view. Follow the `dataviz` skill for anything new.
- **Allocation rows arrive folded and nested** (`breakdown`, the Other row) from the server; the
  page draws them and never folds, sums, or re-shares them itself.
- **Browser storage only for per-viewer conveniences** (`lib/storage.ts`): collapsed cards, hidden
  notices, a chosen range. Never for data that matters; the page must work the same without it.
  Check stored values on read.
- **Scroll wrappers (`overflow-x-auto`) are `relative`**, so absolutely positioned children (the
  `sr-only` header labels) stay inside them instead of widening the page on a phone.
- Shared UI primitives live in `src/components/ui.tsx` (Badge, Button, Stat, Notice, Card, Segmented), built
  with plain Tailwind. shadcn/ui ([ADR 0006](../../docs/adr/0006-application-stack.md)) gets added
  when a component needs Radix-level behavior (menus, dialogs, popovers). Step 01 didn't need any.
