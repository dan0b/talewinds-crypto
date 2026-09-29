# 0006 — Application stack

- **Status:** Accepted
- **Date:** 2026-09-27

## Decision

| Concern | Choice | Why |
|---|---|---|
| Database | Postgres 18 (Docker) | One system of record; `uuidv7()` built in for time-ordered IDs |
| ORM + migrations | Drizzle + drizzle-kit | Typed schema in TS, plain SQL migrations we review and commit |
| Job queue / scheduler | pg-boss | Queue lives in Postgres — no Redis to run |
| API | Hono on Node | Tiny; typed RPC client gives the dashboard end-to-end types without codegen |
| Dashboard | Vite + React + TanStack Router/Query + Tailwind | SPA over our own API; server rendering adds complexity with no benefit for a single-user dashboard |
| UI components | shadcn/ui (added with the first real UI slice) | Copy-in components, no runtime dependency |
| Validation | Zod | Runtime validation + inferred types, one schema per contract |
| Money math | `bigint` + decimal.js | See [0005](0005-typescript-monorepo.md) pitfall 3 |
| CLI | commander | Zero-dependency, stable |
| Logging | pino (+ pino-pretty in dev) | Structured JSON in prod; secrets redacted |
| Tests | Vitest | Fast, TS-native |
| Lint/format | Biome | One fast tool instead of ESLint + Prettier |
| Boundary rules | Custom script (`tooling/scripts/check-boundaries.ts`) | See below |
| LLM layer | Vercel AI SDK | Provider-agnostic; see [0010](0010-ai-generate-and-decide.md) |

**Boundary rules:** we planned to use dependency-cruiser but replaced it with a ~150-line script.
pnpm already refuses to resolve undeclared dependencies, so checking each `package.json` against
an allow-list, plus scanning for cross-package relative imports, covers the rules we need — with
zero added dependencies and no reliance on the TypeScript compiler API (TypeScript 7 is the native
compiler).

## Consequences

- Tooling versions are recent (TypeScript 7, pnpm 12, Vite 8, Vitest 5, AI SDK 7). Verify APIs
  against installed type definitions rather than memory.
