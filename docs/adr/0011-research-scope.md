# 0011 — Research scope: low-to-mid caps, insider analysis first

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

For established projects, a general chatbot already gives decent research. The research
pipeline's value grows as market cap shrinks, because low caps carry risks that must otherwise be
checked by hand: snipers, bundled wallets, insiders, dev-wallet behavior.

## Decision

- **Target low-to-mid cap tokens first.** The user's main use is medium/longer-term plays on
  **Robinhood Chain**; Solana memecoins are rarely worth research tokens.
- **Insider analysis is the core value-add:** snipers, bundles, insider/dev wallets, funding-source
  clusters, holder concentration. It is built as a reusable **investigation** capability
  (`packages/investigation`) that reports call into — the same module later powers wallet
  tracking.
- **Fundamentals** (team, product, tokenomics/unlocks, traction) run for every token **except
  memecoins/junk**, gated by a `token_type` classification (a natural first `decide` job).
- **Two report depths:**
  - `quick` — objective checks only (identity, market, holders, insiders, security). No LLM
    calls; near-free; seconds. For screening.
  - `full` — adds fundamentals and LLM synthesis (thesis, counter-thesis, red flags, open
    questions). For serious candidates.
- **Chain order:** Solana first as the proof of concept (best free data, most bundling/sniping
  activity), then Robinhood Chain; both fully supported in the end.
- Every field carries source + timestamp; missing data is an explicit gap.

## Consequences

- Insider analysis differs by chain family (Solana slots/Jito bundles vs EVM blocks/mempool), so
  Robinhood Chain needs its own implementation after Solana.
- **Risk to validate early:** free-provider coverage of Robinhood Chain (DexScreener, GoPlus,
  etc.). If thin, research there relies on our own RPC reads.
