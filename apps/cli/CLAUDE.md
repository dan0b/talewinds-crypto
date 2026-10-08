# apps/cli

The operations CLI, `tw`. Run from the repo root as `pnpm tw <command>`. For operating the
platform (migrations, registering accounts, syncs, backfills, reconciliation, smoke tests), not for
daily use — that's the dashboard.

- `src/main.ts` — builds the command tree.
- `src/context.ts` — `withRuntime(fn)`: gives a command env + db + logger and always shuts down.
- `src/commands/*.ts` — one file per area; each exports `register…Commands(program)`.

Current commands: `db migrate`, `status`, `ping`, `account add`, `account list`, `sync [--account
<ref>]` (runs in-process, no worker needed), `holdings [--all]`, `asset status <ref> <status>`.

## Rules

- **Commands call the same package capabilities as the API.** Never write to the database with
  ad-hoc SQL from a command; if a capability is missing, add it to a package.
- **stdout is for command output; logs go to stderr** (`withRuntime` sets this), so output can be
  piped.
- **Start the runtime lazily** (inside the action via `withRuntime`) so `--help` works without a
  database.
- **Input errors should be readable:** throw `Error`s with plain messages; Zod errors are formatted
  by `withRuntime`.
- Add an `Examples:` block to any command with non-obvious flags.
