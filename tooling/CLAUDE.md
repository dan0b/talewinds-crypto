# tooling/

Repo-wide configuration and scripts. Not a workspace package; nothing imports from here at
runtime.

- `tsconfig/base.json` — strict compiler settings every package extends.
- `tsconfig/node.json` — base + Node types, for everything except the dashboard.
- `scripts/check-boundaries.ts` — enforces which packages may depend on which (`pnpm boundaries`).

## Rules

- **Changing the boundary matrix (`ALLOWED` / `RESTRICTED`) is an architectural decision.** Do it
  deliberately and note it in the build log. When adding a package, add its row, or the check fails.
- **Never add execution to anything's allow-list except `executor`**
  ([ADR 0001](../docs/adr/0001-execution-boundary.md)).
- **Loosening compiler strictness needs a reason** recorded in the build log. Prefer fixing the
  code.
- Scripts here run with `tsx` and use only Node built-ins. No dependencies.
