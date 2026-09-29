# 18 — News aggregation

- **Phase:** V2 — Always on, always aware
- **Status:** Draft
- **Depends on:** [13 Research workflow](13-research-workflow.md),
  [14 Narratives & theses](14-narratives-and-theses.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

Stay current without doom-scrolling: a digest of crypto news relevant to what you hold, what you're
watching, and the narratives you believe in.

## Scope

- **Sources:** RSS and blogs, project announcements, governance forums, exchange listings.
  X/Twitter stays a known gap unless paid data is approved
  ([ADR 0009](../adr/0009-data-providers-and-cost-tracking.md)).
- Deduplicate and cluster stories; score relevance to holdings, watchlist, and narratives via
  `decide`; summarize via `generate`.
- A daily digest, plus immediate alerts for highly relevant items.

## Acceptance criteria

- [ ] The digest contains only items relevant to your holdings, watchlist, or narratives, each with
      its source.
- [ ] You can mark items irrelevant, and relevance improves from that feedback.

## Open questions

- Which sources? Is paid X data worth it by this point?
