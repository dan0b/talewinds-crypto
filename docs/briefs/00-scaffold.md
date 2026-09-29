# 00 — Scaffold

- **Phase:** Foundation
- **Status:** ✅ Done
- **Depends on:** —
- **Written:** 2026-09-27
- **Build log:** [`2026-09-27-scaffold`](../build-logs/2026-09-27-scaffold.md)

## Goal

Stand up the repository structure, tooling, and infrastructure that every later slice builds on,
and record the decisions from the initial planning session. Infrastructure only, no features.

## Why

The platform should scale across chains, positions, and eventually trading agents without being
restructured. The expensive-to-change decisions (execution boundary, identity model, account
ownership, monorepo boundaries, source of truth) are cheap to get right now.

## Scope

**In:**

- TypeScript monorepo (pnpm + Turborepo): `apps/{api,worker,cli,web}`,
  `packages/{core,db,sources,ai,portfolio,research,investigation}`, `tooling/`.
- Postgres via Docker Compose; Drizzle schema and first migration (accounts, entities, worker
  heartbeats).
- Worker with a Postgres-backed job queue and heartbeat.
- API with a health endpoint and account listing; typed client for the dashboard.
- Dashboard shell: Portfolio / Research / System pages; System shows live health.
- CLI: `db migrate`, `status`, `ping`, `account add`, `account list`.
- Core: CAIP chain identity, account normalization, exact-amount math, job contracts.
- Guardrails: supply-chain settings, import-boundary checker, strict TypeScript, lint.
- Docs: `VISION.md`, `CONTEXT.md`, ADRs for each decision, `CLAUDE.md` in every major directory,
  `briefs/` and `build-logs/`.

**Out:**

- Any real data ingestion (V0a), research pipeline (V0b), AI calls, authentication, deployment,
  CI workflow.

## Acceptance criteria

- `pnpm dev` starts Postgres, applies migrations, and runs api + worker + web.
- The dashboard's System page shows API, database, and worker health.
- `pnpm tw account add …` registers owned/tracked wallets and venue accounts with canonical refs,
  and rejects invalid input clearly.
- `pnpm tw ping` round-trips a job through the queue and worker.
- `pnpm check` passes: lint, boundaries, typecheck, tests.
- The boundary checker demonstrably catches violations.
- The browser bundle contains no server code.

## Open questions

None blocking. Deferred decisions are listed in [`../VISION.md`](../VISION.md#open-questions-decide-when-they-become-relevant).
