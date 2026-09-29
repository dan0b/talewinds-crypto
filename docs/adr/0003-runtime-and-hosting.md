# 0003 — Runtime: local-first, server-shaped; EC2 later

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

Anything beyond a basic dashboard needs something always on: scheduled research, news
aggregation, wallet sync, alerts, and eventually trading agents.

## Decision

- Build as **separate long-running services** — API, background worker/scheduler, database —
  orchestrated with Docker Compose. Run on the user's Mac now; move the same stack to an
  always-on host later with no code changes.
- Target host: **AWS EC2**. Points in its favor for later: Hyperliquid's infrastructure is widely
  reported to run in AWS Tokyo (`ap-northeast-1`) — verify when building agents — and AWS KMS can
  sign with non-exportable secp256k1 keys for EVM hot wallets.
- **No AWS-specific services in the core code path.** Everything runs in containers so the host
  stays swappable.
- Nothing may assume a human is at the keyboard: jobs are scheduled, state lives in the database,
  secrets come from the environment.

## Consequences

- The API binds to `127.0.0.1` and has no auth yet. **Authentication must be added before the API
  or dashboard is reachable from any network.**
- Today only Postgres runs in Docker; the apps are containerized when we first deploy.
