# 0004 — Interfaces: dashboard first, CLI for ops; capabilities live once

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

Candidate interfaces: web dashboard, conversational AI (built-in chat or an MCP server), push
alerts (Telegram), CLI. Each is good at a different job.

## Decision

- **Web dashboard is home base** — eventually everything lives there, including "paste a contract
  address → full research report."
- **CLI (`tw`) for operations:** sync, backfill, reconcile, migrations, smoke tests. One entry
  point with subcommands rather than loose scripts, so startup (env validation, DB, logging,
  shutdown) is shared and every command goes through the same code paths as the dashboard.
- **Later:** Telegram for push alerts and mobile capture (`/research <CA>` → summary + link to the
  dashboard report). An **MCP server** is a cheap add-on once capabilities exist, giving "ask
  Claude about my portfolio" before building chat into the dashboard.
- **Every capability lives once, in a package.** Apps (api, worker, cli, later telegram/mcp) are
  thin wrappers. Trading agents will call the same capabilities the user does.

## Consequences

- Long operations (research takes minutes) are background jobs: the dashboard submits a job, the
  worker runs it, the page shows progress.
- A new interface costs a thin adapter, not a reimplementation.
