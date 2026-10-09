# 02b — Categories and themes

- **Phase:** V0a — What do I own
- **Status:** Ready
- **Depends on:** [01b Portfolio overview](01b-portfolio-overview.md), [02](02-venue-balances.md) (coins)
- **Written:** 2026-10-08
- **Build log:** —

## Goal

Tag every coin, then see the portfolio by tag: **one category** per coin (Major, Speculative,
Stable, …) and **any number of themes** (V4 Hooks, AI, …). For example, ZEC, HYPE, and LIT are
Major; HOOKR is Speculative with the theme V4 Hooks.

## Why

You think about sizing in your own buckets, not by chain or wallet. This is the lightweight version
of the narratives in [step 14](14-narratives-and-theses.md): tags now, theses and history later.

## Scope

**In**

- **Tags live on the coin** (ADR 0019's grouping), so tagging ETH once covers ETH on every chain
  and venue. A coin outside the registry (HOOKR) is tagged as itself.
- **Categories:** you create and name them; each coin has at most one; the rest are
  "Uncategorized". Suggested to start: Major, Speculative, Stable (creating one is optional).
- **Themes:** you create and name them; a coin can have any number; coins without one are
  "No theme".
- **Tag where you look:** on each coin row in the allocation card (pick a category, add or remove
  themes), plus a small editor to rename or delete categories and themes.
- **Views:** the allocation card gains "By category" (a donut and table: categories don't overlap,
  so shares add to 100%) and "By theme" (bars and a table: a coin with two themes counts in both, so
  shares can add to more than 100%, which the view says). Both work for all wallets or one.
- **Stored in Postgres**, so tags survive restarts, and validated at the API.

**Out**

- Theses, evidence, catalysts, and history of beliefs (step 14).
- Suggested or automatic tagging (e.g. from research reports).
- Tags on a single holding (e.g. ETH in one wallet only).

## Approach notes

- Tables: `tags` (`kind` is `category` or `theme`, plus a name, unique per kind, ignoring case) and
  `coin_tags` (coin key → tag). One category per coin is enforced when it's set: setting a category
  replaces the previous one, in one transaction.
- The coin key is the underlying ID (`eth`, `btc`) or the asset's own ref for unregistered coins,
  the same key `byCoin` uses.
- Deleting a tag removes it from every coin. Renaming keeps its assignments.

## Acceptance criteria

- [ ] Tagging a coin shows up immediately in the by-category and by-theme views, for all wallets and
      a single wallet.
- [ ] A coin can't end up with two categories.
- [ ] By-category shares add up to 100% (Uncategorized included). By-theme rows are labeled as
      overlapping.
- [ ] Tags survive a restart, and renames keep assignments.
- [ ] Unit tests for the views; integration tests for tag storage; API tests for validation.

## Open questions

- ~~Free-form tags, or category plus themes?~~ Category plus themes (you chose 2026-10-08).
