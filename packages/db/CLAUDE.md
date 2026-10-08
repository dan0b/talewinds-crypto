# packages/db

Postgres schema, migrations, connection, and plain data access. Postgres is the single source of
truth for everything ([ADR 0007](../../docs/adr/0007-postgres-single-source-of-truth.md)).

- `src/schema/*.ts` — Drizzle table definitions (one file per area).
- `migrations/` — generated SQL migrations, reviewed and committed. `meta/` is drizzle-kit state.
- `src/client.ts` — `createDatabase`, `runMigrations`, `pingDatabase`.
- `src/repos/*.ts` — data-access functions (`addAccount`, `listAccounts`, `recordHeartbeat`, …).

## Rules

- **Schema change workflow:** edit `src/schema/*` → `pnpm db:generate` (from the root) → **read
  the generated SQL** → commit schema and migration together. Never edit a migration that has been
  applied anywhere.
- **Repos hold data access, not business rules.** Validation and normalization come from
  `@talewinds/core`; multi-step domain logic belongs in a domain package.
- **IDs:** `uuid` primary keys defaulting to `uuidv7()` (time-ordered, built into Postgres 18).
- **Timestamps:** always `timestamp with time zone`.
- **Amounts:** raw on-chain quantities in `numeric(78, 0)` (fits uint256); prices/values in
  `numeric`. Never `real`/`double precision`.
- **Guard critical invariants in the database too:** closed sets and row shapes get `CHECK`
  constraints (see `accounts`), uniqueness gets indexes.
- **Raw records are immutable, and the database enforces it:** a trigger rejects UPDATE and DELETE
  on `raw_records`. A migration that must backfill a new column disables the trigger for that
  statement only and re-enables it in the same migration (see `0003_raw_records_dedupe_key.sql`).
  `TRUNCATE` (used by tests) isn't blocked.
- **Deduplicate raw records by `dedupe_key`**, a sha256 of provider + request key + content hash.
  Never put long text columns in a btree index: an entry can't exceed ~2.7 KB, and batched request
  keys are longer than that.
- **jsonb can't store U+0000.** `saveRawRecords` replaces it with U+FFFD for storage (the content
  hash uses the original).
- **Rehearse migrations that touch existing data** on a copy of the dev database first
  (`pg_dump` → scratch database → `DATABASE_URL=… pnpm tw db migrate` → inspect → drop), and keep
  the dump until the real migration is verified. Migration `0004` (wallet backfill) was done this
  way.
- **Surface database errors with `describeError`.** Drizzle's "Failed query: …" messages contain the
  whole SQL and its parameters (tens of KB of stored data); never log or show them raw.
- **Append-only history** where beliefs change (narratives, reports, strategy versions). Revise by
  inserting a new version, not by overwriting.

## Tests

- Integration tests are `*.int.test.ts` files. They run in `pnpm test:int` (part of `pnpm check`)
  against a separate **`talewinds_test`** database, created and migrated automatically. Helpers live
  in `src/testing/test-db.ts`: `createTestDatabase()` and `resetDatabase()` (truncates every table).
- `testDatabaseUrl()` refuses to point at the dev database. Never run tests against it.
