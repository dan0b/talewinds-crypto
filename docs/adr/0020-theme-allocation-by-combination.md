# 0020 — Theme allocation: each coin once, by its combination of themes

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Step 02b lets a coin have any number of themes, and its view counted a coin in each one. Theme
shares could therefore add up to more than 100%, so that view used bars, not a donut. On
2026-10-09 you asked for a donut on the theme view. A donut shows parts of a whole: it can't put
one coin in two slices without counting it twice. Today one coin overlaps (ZEC, in Privacy and
Quantum), which put the theme total at about 119%.

## Decision

- **Each coin counts once, under its full set of themes.**
  - A coin with one theme sits in that theme's slice.
  - A coin with several themes sits in one combined slice named after all of them, such as
    "Privacy + Quantum".
  - A coin with no theme is in "No theme".

  The slices add up to 100%, as categories do.
- Themes are assigned to coins exactly as before; only the view changes.
- Two alternatives were rejected:
  - Splitting a coin evenly between its themes. That attribution is arbitrary and understates
    each theme.
  - Sizing the ring by overlapping totals. The slices wouldn't match their percentages.

## Consequences

- Every dollar appears once, and every theme number is exact.
- Your total Privacy exposure can be spread across several slices, such as Privacy and
  Privacy + Quantum. If combinations multiply, a per-theme exposure view can come back alongside
  this one with narratives (step 14).
