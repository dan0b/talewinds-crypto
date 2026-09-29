# 0010 — Two AI primitives: `generate` and `decide`

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

The user wants Claude now, with easy switching to other providers (OpenAI, etc.), and intends to
integrate **Jev** (TypeSafe AI's first "System One" model, early access as of 2026-09) into trading
agents. Per TypeSafe, Jev is not a text generator: unstructured input in, **typed decisions with
calibrated confidence** out, at a claimed 70–500ms latency and very low cost. No public SDK yet.
Source: https://typesafe.ai/blog/introducing-system-one-models-and-jev

## Decision

`packages/ai` exposes two primitives, both taking a Zod schema and returning validated, typed
results:

| Primitive | Purpose | Backed by |
|---|---|---|
| `generate` | Writing and reasoning: report synthesis, thesis/counter-thesis, agent reasoning | Claude by default, via the **Vercel AI SDK** (switching providers is config) |
| `decide` | Fast typed judgments with confidence: classify, score, route, verify | **Claude with structured output until Jev access**; Jev plugs in behind the same interface |

- Models are configured **per task** (e.g. `research.synthesis → anthropic/<model>`).
- Candidate `decide` uses: transaction classification, `token_type` classification (research
  routing), insider red-flag scoring, verifying LLM claims against gathered evidence, and later
  fast enter/skip decisions for agents.

## Consequences

- "Can't hallucinate" means "can't return malformed output" — it can still be *wrong*. Jev's
  calibration must be measured on our own labeled data before it touches anything involving money.
- Call sites never depend on a specific provider.
