# Build log: 02b — Categories and themes

- **Date:** 2026-10-08
- **Brief:** [02b-categories-and-themes](../briefs/02b-categories-and-themes.md)

## Summary

You can tag every coin with **one category** and **any number of themes**, and see the portfolio by
either. The allocation card has two new views: **Category** (a donut; shares add up to 100%) and
**Theme** (bars, because a coin can have several themes). Tags live on the coin, so tagging ETH once
covers it on every chain and venue.

Your tags, applied at your request: ZEC, HYPE, and LIT are Major; HOOKR is Speculative with the
theme V4 Hooks. That gives Major 45.8%, Speculative 18.1%, and Uncategorized 36.0% of $36,124, and
V4 Hooks 18.1%.

## What was built

- **Database:** migration `0007_categories_and_themes`.
  - `tags` holds the kind (category or theme) and a name, unique per kind ignoring case.
  - `coin_tags` maps a coin key to a tag. A composite foreign key `(tag_id, kind)` forces each
    assignment's kind to match its tag, and a partial unique index allows **one category per coin**
    in the database itself. Deleting a tag cascades to its assignments.
  - Repos: `listTags`, `listCoinTags`, `createTag`, `renameTag`, `deleteTag`, `setCoinCategory`
    (replaces the old category in one transaction), and `setCoinThemes` (sets the exact list and
    refuses tags of the wrong kind). Their errors are written for people.
- **Core:** `CoinKey` (a registry ID like `eth`, or an asset ID; never a ticker), `TagKind`, and
  `TagName`.
- **Portfolio:** the holdings view lists every tag, each coin row carries its tags, and the overview
  adds `byCategory` and `byTheme`, with Uncategorized and No theme always last. Small coins still
  count in their category. Both views follow the scope (all wallets or one).
- **API:** `POST /tags`, `PATCH /tags/:id`, `DELETE /tags/:id`, `PUT /coin-tags/category`, and
  `PUT /coin-tags/themes`, all Zod-validated. Duplicates return 409, an unknown tag 404, and a
  ticker as the coin key or a tag of the wrong kind 400.
- **Dashboard:**
  - In the allocation card, each coin row shows its tags and a "Tag" button that opens an editor:
    category chips (click a selected one again to clear it), theme toggles, and "+ New" fields.
    While you have no categories, Major, Speculative, and Stable are offered. "Manage tags" renames
    and deletes tags (with a confirmation).
  - The allocation views are now Asset, Category, Theme, Wallet, and Chain. Theme shows bars and a
    note instead of a donut.

## Deviations from the brief

- **Tagging lives only in the allocation card's coin rows**, not in the holdings tables. That's
  where coins are, and the brief named it first.

## Verification performed

- **Tests:** 5 integration tests on tag storage. They cover case-insensitive uniqueness per kind, a
  category being replaced, the database refusing a second category or a mismatched kind, theme lists
  being exact, a refused change leaving the coin as it was, assignments surviving a rename, and the
  cascade on delete. Plus 4 unit tests for the views (coin tags, by category adding up to 100%,
  overlapping themes, scope), 3 API tests (create and duplicate, rename and delete with 404, coin
  key validation and wrong kind), and 1 core test for coin keys.
- **Live, through the API:** your tags were created and assigned; a duplicate "major" got 409.
- **In headless Chrome:** the Category view (donut), the Theme view (bars and the note), and the
  HOOKR editor were checked. Clicking the Major chip moved HOOKR to Major, and clicking Speculative
  moved it back; the badges updated each time.
- `pnpm check` passes: **127 unit tests** and **28 integration tests**.

## Known gaps

- Coins outside the registry are tagged per venue or chain. ZEC at Coinbase and ZEC elsewhere (if you
  ever hold it) would be separate coins until ZEC joins the registry.
- No history of tag changes (low stakes; step 14's narratives will keep history).
- Tags aren't in the holdings tables or the CLI yet.

## Next steps

- Tag the rest (USDC as Stable, perhaps). The Uncategorized row shows what's left.
- [02c Perp positions](../briefs/02c-perp-positions.md) when you trade perps; then step 03.
