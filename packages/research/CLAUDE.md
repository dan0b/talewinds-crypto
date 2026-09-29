# packages/research

The token research pipeline: contract address in, structured, source-backed report out.
**Empty until V0b.** Scope: [ADR 0011](../../docs/adr/0011-research-scope.md).

## Planned shape

- **Resolve:** chain + contract → identity; flag ticker collisions, proxies, suspicious metadata.
- **Collect** (per section): market structure, holders, insider analysis (via `investigation`),
  contract/security checks, links. For non-memecoins: fundamentals (team, product,
  tokenomics/unlocks, traction).
- **Synthesize** (`full` depth only): thesis, counter-thesis, red flags, open questions, via
  `ai.generate`.
- **Depths:** `quick` (objective sections, no LLM calls) and `full` (adds fundamentals +
  synthesis).
- Chains: Solana first, then Robinhood Chain.

## Rules

- **Every finding carries source + timestamp.** Missing data is an explicit gap with a reason.
- **Facts and claims are separate.** A project's own claims are labeled as claims.
- **Reports are versioned, not overwritten.** Re-running research creates a new version, so
  changes in the evidence are visible.
- **Section-based:** each section is an independent unit with its own inputs, sources, and gaps.
  A new section should not require touching the others.
- **`token_type` gates fundamentals.** Memecoins/junk skip them to save tokens.
- **No scores or sizing presented as policy** until the strategy document exists
  ([VISION.md](../../docs/VISION.md)).
- **Reports show their cost** (API calls + LLM spend) in a few lines.
- **Research runs as a worker job**, never inside an API request.
