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
- **Raw records are immutable.** Tables holding provider responses are insert-only; corrections go
  in separate rows that reference the original.
- **Append-only history** where beliefs change (narratives, reports, strategy versions). Revise by
  inserting a new version, not by overwriting.
