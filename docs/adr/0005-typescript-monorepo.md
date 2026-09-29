# 0005 — TypeScript monorepo with supply-chain hardening

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

We weighed Python backend + TypeScript dashboard against TypeScript everywhere. The user is most
fluent in Python but prioritized what is best for the application over readability.

## Decision

- **TypeScript everywhere**, in one pnpm + Turborepo monorepo on Node LTS.
  - The dashboard is the primary interface; one language end to end means shared types without
    codegen.
  - Agentic trading is event-driven and I/O-heavy — Node's strength.
  - Execution tooling is TypeScript-first on Solana and excellent on EVM (viem).
  - One schema language (Zod) shared by dashboard, API, worker, CLI, and agents.
- **Escape hatch:** a separate Python package may join later for quant/backtesting, reading the
  same database. Cost basis and P&L do not need it.
- **Monorepo shape:** `apps/` are programs you run; `packages/` are shared logic. Internal
  packages export TypeScript source directly (no per-package build step).

## Known pitfalls and their mitigations (built in from day one)

1. **npm supply-chain attacks** (e.g. the `@solana/web3.js` key-stealing release, Dec 2024; the
   `chalk`/`debug` compromise and Shai-Hulud worm, Sep 2025). Mitigated in
   `pnpm-workspace.yaml`: `minimumReleaseAge: 10080` (7 days), `trustPolicy: no-downgrade`,
   dependency install scripts blocked unless allow-listed, exact version pins.
2. **Boundary erosion** — mitigated by `pnpm boundaries` (see [0001](0001-execution-boundary.md)).
3. **Numeric precision** — `bigint` for raw amounts, `Dec` (decimal.js) for human values, never
   `number`; `toJson` for bigint-safe JSON. See `packages/core/src/amounts.ts`.
4. **Types vanish at runtime** — Zod validation at every boundary.
5. **ESM/CJS and config sprawl** — ESM only, one shared base tsconfig, source-exported packages.
6. **Weak data/quant ecosystem** — analytics in SQL; Python escape hatch above.
7. **Single-threaded event loop** — heavy work runs in the worker, never the API.

## Consequences

- Adding a dependency is a deliberate act; brand-new releases are unavailable for 7 days by design.
