# 0017 — View-only venue keys may be used outside execution

- **Status:** Accepted (amends [0001](0001-execution-boundary.md))
- **Date:** 2026-10-08

## Context

Coinbase authenticates every API request with a short-lived token (a JWT) signed by the API key's
private key. [ADR 0001](0001-execution-boundary.md) and Rule 1 say only the future executor may
load private keys or sign. The purpose of that rule is that a bug in research or portfolio code
can't move funds. A key created with **View** permission only can read balances, but it can't
trade or move money. Reading Coinbase at all requires signing with such a key.

## Decision

- **View-only venue API keys are the one kind of key allowed outside execution.** `packages/sources`
  may load one from env and use it to sign authentication tokens for **read** requests. Wallet keys,
  and any key that can trade or transfer, remain execution-only.
- **The permission is checked, not assumed.** Before reading anything, every sync asks the venue
  what the key can do (Coinbase: `GET /api/v3/brokerage/key_permissions`). If the key can trade or
  transfer, or can't view, the sync fails with an explicit error and the key isn't used further.
  It fails closed: an answer we can't read counts as a refusal.
- **Handling:** the key lives only in env. It's parsed once at startup and never logged or stored.
  Each request gets its own token, valid for two minutes, sent only in the request header. Raw
  records store responses, never requests or headers.
- **Scope of the code:** venue authentication lives in `packages/sources/src/venues/` and uses only
  `node:crypto`. It signs token claims and nothing else; it builds no transactions.

## Consequences

- Rule 1 and `packages/sources/CLAUDE.md` name this exception explicitly.
- A key with too much permission is refused, so it can't be silently over-trusted. Fix it by
  creating a View-only key.
- If Coinbase changes its permission model, the guard fails closed, and syncing stops until it's
  reviewed.
- Hyperliquid's reads need no key (its info API is public), so this applies to Coinbase only today.
