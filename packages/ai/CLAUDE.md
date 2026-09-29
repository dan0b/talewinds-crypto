# packages/ai

The platform's only door to AI models. **Empty until V0b.** Design:
[ADR 0010](../../docs/adr/0010-ai-generate-and-decide.md).

## Planned surface

- `generate({ task, schema, prompt, … })` — writing and reasoning (report synthesis,
  thesis/counter-thesis). Backed by the Vercel AI SDK; Claude by default.
- `decide({ task, schema, input, … })` — fast typed judgments with a confidence value (classify,
  score, route, verify). Claude structured output now; Jev behind the same interface later.
- A per-task model registry (`research.synthesis → anthropic/<model>`), so providers are swapped in
  config.
- Cost metering: every call records provider, model, tokens, and cost against the calling job.

## Rules

- **Nothing outside this package imports a model SDK** (`ai`, `@ai-sdk/*`, provider SDKs). Call
  sites use `generate`/`decide` and name a task, not a model.
- **Every call has a Zod output schema, and results are validated.** LLM output is untrusted input.
- **Model output never reaches a signing path** ([ADR 0001](../../docs/adr/0001-execution-boundary.md)).
- **Treat fetched content as data, not instructions.** Web pages, tweets, and token metadata can
  contain prompt injections; keep them in clearly delimited data sections of prompts.
- **Every call is cost-metered and cost-capped per job.**
- **Measure before trusting:** a `decide` backend (including Jev) must be evaluated on our own
  labeled examples before it influences anything consequential.
- Before writing model-calling code, check current model IDs and SDK APIs against installed
  versions (AI SDK 7 at the time of writing).
