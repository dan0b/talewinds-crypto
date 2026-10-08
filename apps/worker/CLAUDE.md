# apps/worker

Runs background jobs and schedules: syncs, research reports, and (later) agents. Jobs come from a
queue stored in Postgres (pg-boss), so the API and CLI enqueue work and this process executes it.

- `src/main.ts` — starts the runtime and queue, registers handlers, writes a heartbeat every 15s
  (the dashboard's "worker alive" signal), prunes heartbeats older than a day.
- `src/context.ts` — `WorkerContext`, what every handler receives.
- `src/handlers/*.ts` — one file per area; each exports a `register…Handlers(context)` function.
  `portfolio.ts` runs `portfolio.syncAll` (every owned wallet, then prices) on a cron schedule,
  every `PORTFOLIO_SYNC_MINUTES`.
- On startup, sync runs left `running` by a crashed process (older than 30 minutes) are marked
  failed.

## Rules

- **Job contracts live in `@talewinds/core` (`JOBS`)**, not here. A job's name, input schema, and
  output schema are shared with whoever enqueues it.
- **Handlers are thin.** Call a package capability; don't implement domain logic in the handler.
- **Handlers must be safe to retry.** pg-boss retries failed jobs, so a handler that runs twice
  must not double-write (use upserts / idempotency keys).
- **Anything slow or CPU-heavy runs here, never in the API.**
- **Every job that calls paid APIs or LLMs records its cost** ([ADR 0009](../../docs/adr/0009-data-providers-and-cost-tracking.md)).
- Add shared clients (source adapters, AI) to `WorkerContext` rather than constructing them per
  job.
