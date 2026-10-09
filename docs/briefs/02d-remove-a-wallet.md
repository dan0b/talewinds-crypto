# 02d — Remove a wallet

- **Phase:** V0a — What do I own
- **Status:** ✅ Done
- **Depends on:** [01a Wallets](01a-wallets-and-market-data.md)
- **Written:** 2026-10-09
- **Build log:** [`2026-10-09-remove-a-wallet`](../build-logs/2026-10-09-remove-a-wallet.md)

## Goal

Remove a wallet from the dashboard or the CLI, for example one added by mistake.

## Why

Before Bitcoin was supported, your Xverse payment address (`3…`) was taken for a Solana address
and added as a Solana wallet. Its syncs fail every 15 minutes, and there was no way to remove it.
Removing a wallet was a known gap since step 01a.

## Scope

**In**

- **Remove = delete the wallet and everything that hangs off it:** its per-chain accounts, their
  sync runs, and their balance snapshots (database cascades). **Kept:** raw provider responses
  (immutable by design), assets, prices, and tags, which are shared with other wallets.
- **Dashboard:** a "Remove" action on each wallet card, behind a confirmation that names the wallet
  and says what's deleted. If that wallet was the selected scope, the page falls back to all
  wallets.
- **API:** `DELETE /api/wallets/:id` (404 for an unknown wallet).
- **CLI:** `tw wallet remove <address or id>`, which only lists what would be removed unless you
  add `--yes`.

**Out**

- Removing venue accounts (Coinbase, Hyperliquid).
- Undo or archive. Adding the address again re-creates the wallet; the next sync restores current
  balances, but not the deleted history.

## Acceptance criteria

- [x] Removing a wallet takes it out of totals, the allocation, and the lists right away; other
      wallets are untouched.
- [x] Its accounts, sync runs, and snapshots are gone; raw records are kept.
- [x] The dashboard asks before removing; the CLI does nothing without `--yes`.
- [x] Integration test for the cascade; API test for the route.

## Open questions

- None.
