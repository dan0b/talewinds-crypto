# packages/runtime

How a Node process starts and stops. Shared by `api`, `worker`, and `cli` so every entry point
behaves the same.

- `env.ts` — loads the repo-root `.env` (real env vars win), `BaseEnv` schema, `loadEnv`.
- `logger.ts` — pino logger with credential redaction; pretty output outside production.
- `queue.ts` — `createQueue`: a typed wrapper over pg-boss. Validates job input on send and work,
  and output on read.
- `runtime.ts` — `startRuntime({ name, env })` → env + logger + database + ordered shutdown.

## Rules

- **Node-only infrastructure, no domain logic.** If it knows what an account or a token is, it
  doesn't belong here.
- **Apps extend `BaseEnv`** (`BaseEnv.extend({...})`) for their own variables. Every variable is
  validated at startup; a missing or malformed value stops the process with a clear message.
- **Never log secrets.** Add new credential-shaped field names to the logger's `redact` paths when
  introducing them.
- **Register cleanup with `onShutdown`.** Anything that opens a connection or timer must close it
  there. Cleanups run in reverse order of registration.
- **Use the queue wrapper, not pg-boss directly**, so every job goes through its contract in
  `@talewinds/core`.
