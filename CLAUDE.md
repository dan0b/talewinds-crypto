# Talewinds

A personal crypto platform: portfolio across every wallet/chain/venue, automated token research,
wallet investigation, and (later) agentic trading. One user. Start with
[`docs/VISION.md`](docs/VISION.md); the build plan is [`docs/ROADMAP.md`](docs/ROADMAP.md) (one
brief per step); vocabulary is in [`docs/CONTEXT.md`](docs/CONTEXT.md); decisions and their reasons
are in [`docs/adr/`](docs/adr/).

## Layout

```
apps/        programs you run — thin wrappers over packages
  api/       HTTP API for the dashboard (Hono)
  worker/    background jobs + schedules (pg-boss queue in Postgres)
  cli/       operations CLI: `pnpm tw <command>`
  web/       dashboard (Vite + React), runs in the browser
packages/    shared logic, written once
  core/      domain types, identity (CAIP), exact-amount math, job contracts — no I/O
  db/        Postgres schema, migrations, data access
  runtime/   Node process bootstrap: env, logging, db connection, queue, shutdown
  sources/   external adapters (chains, venues, data providers)
  ai/        `generate` + `decide` primitives, model config, cost tracking
  portfolio/ balances → events → lots → cost basis → P&L → reconciliation
  research/  token research pipeline (quick/full reports)
  investigation/ funding graphs, clusters, labels, tracked-wallet analytics
tooling/     shared tsconfig + repo scripts (boundary checker)
docs/        vision, roadmap, glossary, ADRs, briefs, build logs
```

Every major directory has its own `CLAUDE.md` with its purpose and rules. Read it before working
there.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start Postgres, apply migrations, run api + worker + web (http://localhost:5173) |
| `pnpm check` | Lint, boundaries, typecheck, unit + integration tests. **Must pass before work is done.** |
| `pnpm test:int` | Integration tests (`*.int.test.ts`) against the `talewinds_test` database |
| `pnpm tw <cmd>` | Operations CLI (`pnpm tw --help`): `sync`, `holdings`, `account add`, … |
| `pnpm db:generate` | Generate a migration after editing `packages/db/src/schema` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm format` | Auto-fix formatting and import order |

## Rules (apply everywhere)

1. **No keys, no signing outside execution.** Only the future `packages/execution` +
   `apps/executor` may load private keys or sign. Main wallets are watch-only. Research, portfolio,
   and AI code is read-only by construction. ([ADR 0001](docs/adr/0001-execution-boundary.md))
2. **Money math is exact.** On-chain quantities are `bigint` (`RawAmount`); human-scale values
   (prices, USD) are `Dec`. Never use JS `number` for either. Serialize with `toJson` (bigint-safe).
   See `packages/core/src/amounts.ts`.
3. **Validate every boundary with Zod:** provider responses, API input, CLI input, job payloads,
   and especially LLM output. Types vanish at runtime.
4. **Identity is chain + contract (CAIP), never a ticker.** Use `packages/core/src/chains.ts` and
   account refs. ([ADR 0013](docs/adr/0013-chain-agnostic-identity.md))
5. **Never guess.** Unknown activity is `unclassified`; missing data is an explicit gap;
   consequential values carry source + timestamp. Every number is correct or visibly incomplete.
   ([ADR 0002](docs/adr/0002-ledger-truth-and-reconciliation.md))
6. **Capabilities live once, in packages.** Apps only parse input, call a capability, and shape
   output. If two apps need it, it belongs in a package.
7. **Respect the boundaries.** `pnpm boundaries` enforces who may depend on whom
   (`tooling/scripts/check-boundaries.ts`). Change the matrix only as a deliberate decision.
8. **Dependencies are deliberate.** Prefer what's already installed. Add with `pnpm add` (exact
   pins are automatic). Never lower `minimumReleaseAge`, disable `trustPolicy`, or allow a
   package's install script without reviewing it. ([ADR 0005](docs/adr/0005-typescript-monorepo.md))
9. **Secrets live in the environment only** — `.env` locally (git-ignored), real env vars when
   deployed. Never in the repo, the database, logs, or error messages.
10. **Schema changes go through migrations:** edit `packages/db/src/schema/*` →
    `pnpm db:generate` → review the SQL → commit it. Never edit a migration that has been applied.
11. **Verify APIs against installed versions.** The toolchain is recent (TypeScript 7, pnpm 12,
    Vite 8, Vitest 5, AI SDK 7, pg-boss 12). Read the type definitions in `node_modules` rather
    than relying on memory.
12. **Imports use explicit `.ts` extensions** for relative paths; no enums, namespaces, or
    constructor parameter properties (`erasableSyntaxOnly`).
13. **The dev database holds the user's real accounts.** Never delete or modify accounts you didn't
    create. Test data you add by hand gets a `test-` label and is removed afterwards. Automated tests
    use the separate `talewinds_test` database only.

## Documentation workflow

- **Work follows the roadmap.** Every step in `docs/ROADMAP.md` has a brief at
  `docs/briefs/NN-<slug>.md`. Before building a step, re-read its brief and resolve its open
  questions; if the scope changes, update the brief first. New work that isn't on the roadmap gets
  a step (and a brief) before it gets built.
- **After building it:** write a build log at `docs/build-logs/YYYY-MM-DD-<slug>.md` (same slug as
  the brief) covering what was built, deviations from the brief, verification, and known gaps. Then
  mark the step `✅ Done` in the brief and in `ROADMAP.md`. Details: `docs/CLAUDE.md`.
- **When a decision is made:** add an ADR in `docs/adr/` and link it from `docs/VISION.md`.
- **When a new term appears:** add it to `docs/CONTEXT.md`.
- **When a rule is created for a directory:** add it to that directory's `CLAUDE.md`.
