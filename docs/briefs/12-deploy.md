# 12 — Deploy: always-on hosting

- **Phase:** V2 — Always on, always aware
- **Status:** Draft
- **Depends on:** 01–05 (something worth running 24/7)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

The platform runs 24/7 on EC2, so scheduled research, syncs, alerts, and webhooks keep working while
your laptop is closed ([ADR 0003](../adr/0003-runtime-and-hosting.md)).

## Scope

- Container images for api, worker, and web, running as the same Docker Compose stack on the host.
- **Private access, not public:** e.g. Tailscale, so the dashboard is reachable only from your own
  devices, plus app-level authentication as a second layer. Nothing listens publicly except a
  signature-verified webhook endpoint (needed by 16).
- Secrets injected as environment variables at deploy time, with no AWS-specific code in the app.
- Automated Postgres backups with retention, and a tested restore.
- Health monitoring (worker down → alert, once 15 exists).
- `NODE_ENV=production`, so logs are JSON.

## Acceptance criteria

- [ ] The dashboard works from your phone over the private network and is unreachable from the
      public internet (verified).
- [ ] A backup has been restored successfully.
- [ ] A reboot brings everything back with no manual steps.

## Open questions

- Tailscale vs Cloudflare Access vs app auth only.
- Region: Tokyo is closest to Hyperliquid, which matters for trading later.
- Instance size and monthly cost.
