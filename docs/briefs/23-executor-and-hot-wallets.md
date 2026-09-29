# 23 — Executor & hot wallets

- **Phase:** Priority 2 — Agentic trading
- **Status:** Draft (security-critical)
- **Depends on:** [22 Backtesting & paper trading](22-backtesting-and-paper-trading.md)
- **Written:** 2026-09-27
- **Build log:** —

> **Draft:** direction only. Refine in a planning session before building.

## Goal

Build the only code that can sign, exactly as [ADR 0001](../adr/0001-execution-boundary.md)
requires.

## Scope

- `packages/execution` + `apps/executor`, with the smallest possible dependency tree.
- **Key custody:**
  - EVM keys in AWS KMS (non-exportable secp256k1 signing).
  - A Solana approach, decided here.
  - For Hyperliquid, an API ("agent") wallet authorized to trade but not to withdraw. Verify this
    in Hyperliquid's docs first.
- **Hard limits**, stored where the running app can't write them (e.g. deploy-time config):
  per-trade cap, daily loss limit, allow/deny lists, maximum slippage.
- Intent validation against those limits.
- A kill switch, both manual and automatic on the loss limit.
- A full audit log of every intent and its outcome.
- Hot wallets registered as owned accounts, so the ledger tracks them like everything else.
- A written threat model, and a security review before first use.

## Acceptance criteria

- [ ] A paper-validated intent executes on Hyperliquid at minimal size.
- [ ] Intents that violate limits are rejected and logged.
- [ ] The kill switch halts all execution.
- [ ] The boundary check still proves that nothing but the executor can import execution code.
