# apps/api

HTTP API for the dashboard. A thin layer: routes parse input, call package capabilities, and shape
JSON.

- `src/app.ts` — `createApp(deps)`: all routes, with capabilities injected as functions. Exports
  `AppType`, which the dashboard imports (type-only) for its typed client.
- `src/main.ts` — wires real database-backed implementations into `createApp` and serves it.
- All routes live under `/api`.

## Rules

- **No business logic here.** If a route needs more than parse → call → shape, the logic belongs
  in a package.
- **Inject capabilities through `ApiDeps`** so routes are testable with fakes (see
  `app.test.ts`); never import the database directly into route handlers.
- **Chain route definitions** (`new Hono().get(...).post(...)`) so `AppType` carries every route's
  types to the dashboard.
- **Validate request input with Zod** via the `valid(target, schema)` helper, so the dashboard's
  typed client knows the input shape. Return DTOs with ISO-string dates and string amounts, never
  raw rows, `Date`s, or `bigint`s.
- **Always pass an explicit status to `c.json(body, status)`.** The typed client narrows responses by
  status; `c.json(body)` without one is typed as "any success code" and can't be narrowed.
- **Never leak secrets in errors.** Error messages returned to clients must not include connection
  strings, keys, or provider responses containing credentials.
- **Localhost only until auth exists.** The server binds `127.0.0.1`. Binding to any other
  interface requires adding authentication first ([ADR 0003](../../docs/adr/0003-runtime-and-hosting.md)).
- Long-running work (research, syncs) is enqueued as a job for the worker, never run inside a
  request.
