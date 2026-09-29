# 05 — Full research report: AI layer + synthesis

- **Phase:** V0b — Contract address → research report
- **Status:** Ready
- **Depends on:** [03 Quick research report](03-quick-research-report.md),
  [04 Insider analysis](04-insider-analysis-solana.md)
- **Written:** 2026-09-27
- **Build log:** —

## Goal

Add the `full` report depth. It classifies the token type, then synthesizes a thesis,
counter-thesis, red flags, and open questions, with each point grounded in the report's collected
evidence, and shows what the report cost. This step builds `packages/ai`.

## Why

It turns collected data into judgment you can act on. It also establishes the AI layer
([ADR 0010](../adr/0010-ai-generate-and-decide.md)) that fundamentals, news, the assistant, and
agents will all reuse.

## Scope

**In**

- **`packages/ai`:** `generate` and `decide` over the Vercel AI SDK (Anthropic by default); a
  per-task model registry in config; Zod-validated outputs; retries; per-job cost caps.
- **Cost tracking (minimal):** an `llm_calls` table (job, task, provider, model, input/output
  tokens, cost, latency). Reports show API calls, tokens, and dollars in a few lines.
- **Token type** via `decide`: memecoin/community, project/protocol, stable/wrapped, or unknown,
  with a confidence. Low confidence is treated as a project, so fundamentals (11) aren't skipped by
  mistake.
- **Synthesis section:** thesis, counter-thesis, red flags, open questions. Every point cites the
  section evidence it rests on.
- **Verification pass:** `decide` checks each synthesized claim against the collected evidence.
  Unsupported claims are flagged, not hidden.
- **Prompt-injection hygiene:** fetched content (token metadata, websites) goes into clearly
  delimited data blocks, never into instructions.
- **Dashboard:** a depth selector (quick/full), the synthesis with clickable citations to
  sections, and a cost footer.
- **Jev readiness:** `decide` doesn't depend on a particular model provider. Jev plugs in when
  access arrives, after evaluation (25).

**Out**

- Fundamentals via web research (11); strategy-based scoring or sizing (20–21).

## Acceptance criteria

- [ ] A full report on a Solana token includes a synthesis in which every thesis point and red flag
      links to evidence, and the verifier flags unsupported claims.
- [ ] Changing the synthesis model or provider is a config change (demonstrated with a second
      model).
- [ ] Every LLM call is recorded with tokens and cost, the report shows its total, and a per-job
      cap stops runaway spend.
- [ ] `quick` reports still make zero LLM calls.

## Open questions

- Which Claude models per task? Check current model IDs and pricing when building.
- Demonstrate provider switching with a second provider (needs an API key) or just a second Claude
  model?
