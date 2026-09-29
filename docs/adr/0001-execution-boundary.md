# 0001 — Execution boundary: read-only core, isolated execution

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

The original brief forbade the system from ever building, signing, or submitting transactions. The
platform vision includes agentic trading (priority 2), which requires exactly that. We need one
codebase that supports trading later without letting research or portfolio code ever move funds.

## Decision

- Everything in priority 1 — research, portfolio, analytics, AI assistants — is **read-only by
  construction**. It never imports signing code and never sees a private key.
- Execution will live in its own package + app (`packages/execution`, `apps/executor`). They are
  the **only** code allowed to load keys, and they sign only from **dedicated hot wallets with
  capped balances** that the user tops up deliberately.
- **Main holdings wallets are watch-only.** The user said "for now"; nothing may depend on that
  changing, and changing it requires a new ADR.
- Agents never sign. They submit **trade intents** (e.g. "buy X, max $Y, slippage Z"). The
  executor validates every intent against hard limits (per-trade cap, daily loss limit, token
  allow/deny lists, kill switch) before signing. LLM output never flows directly into a signing
  path.
- The boundary is enforced mechanically: `tooling/scripts/check-boundaries.ts` fails the build if
  anything other than `executor` depends on `execution`.

## Consequences

- Research and portfolio code can be iterated on aggressively; a bug there cannot lose money.
- Execution's hard limits are a *security* boundary. They must not be writable by the running app
  (see [0007](0007-postgres-single-source-of-truth.md)); the mechanism is decided when execution is
  built.
- The executor should keep the smallest possible dependency tree (supply-chain risk, see
  [0005](0005-typescript-monorepo.md)).
