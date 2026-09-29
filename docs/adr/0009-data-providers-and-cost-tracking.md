# 0009 — Free data tiers first; minimal cost tracking

- **Status:** Accepted
- **Date:** 2026-09-27

## Decision

- **Data providers start on free tiers** (RPC/indexers, prices, security checks). Upgrade to paid
  plans only where real limits are hit. Every provider sits behind an adapter, so upgrading is a
  config change, not a code change.
- **AI calls are not free-tier-constrained:** the user's Anthropic account is used.
- **Minimal cost tracking:** jobs record API calls and LLM token spend; a research report shows it
  in a few lines. This also establishes per-job cost caps, which become essential once agents run
  unattended.

## Consequences

- Free tiers mean rate limits: adapters get caching and throttling from day one.
- **No X/Twitter data** initially (the free API doesn't realistically allow reading posts). Social
  signals start as links and metadata only, and reports must show this as an explicit gap.
