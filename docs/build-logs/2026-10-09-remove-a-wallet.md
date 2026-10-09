# Build log: 02d — Remove a wallet

- **Date:** 2026-10-09
- **Brief:** [02d-remove-a-wallet](../briefs/02d-remove-a-wallet.md)

## Summary

Wallets can be removed: a "Remove" action on each wallet card (behind a confirmation), the API
route `DELETE /api/wallets/:id`, and `tw wallet remove`. Removing deletes the wallet, its per-chain
accounts, and their sync runs and balance snapshots. Raw provider responses, assets, prices, and
tags stay.

The reason this was needed: your Xverse payment address (`3Fdx…ZV1E`, a Bitcoin P2SH address) was
added as a **Solana** wallet before Bitcoin support existed, and its syncs fail. You've since
re-added it correctly as "XVerse BTC" (0.05196367 BTC at its first sync). The old Solana entry,
"XVerse", is ready to remove.

## What was built

- **Database:** `removeWallet` deletes the wallet in one transaction and reports how many accounts
  went with it. The schema's existing cascades remove accounts, then sync runs and balance
  snapshots; raw records aren't linked by foreign key and are immutable anyway.
- **Portfolio:** `removeWallet`, the capability every app calls.
- **API:** `DELETE /api/wallets/:id` returns 200 with what was removed, 404 for an unknown wallet,
  and 400 for a malformed ID.
- **CLI:** `tw wallet remove <address or id>` only lists what would be removed (accounts and
  chains) unless you add `--yes`. Lookup by address now refuses an ambiguous address. Your two
  Xverse wallets share one address in different families, so the CLI lists both IDs instead of
  picking one. `tw wallet rename` uses the same lookup.
- **Dashboard:** "Remove" next to "Rename" on each wallet card (not on venue cards), with a
  confirmation that names the wallet, its family, and its address. If the removed wallet was the
  selected scope, the page falls back to all wallets.

## Also in this change

- **Bitcoin reads now go to Blockstream first, with mempool.space as the fallback.** On 2026-10-09
  mempool.space started resetting the TLS handshake from here (the connection opened, then dropped
  at the Client Hello), and each Bitcoin sync waited about 50 seconds before falling back. With a
  fallback ready, the primary now gets one retry and a 10-second timeout, so failover takes
  seconds. Provider names now come from the host (e.g. `esplora:blockstream.info`).

## Verification performed

- **Integration tests:** removing one of two wallets deletes its 2 accounts, their sync runs, and
  their snapshots, leaves the other wallet's intact, and keeps every raw record. An unknown wallet
  is refused.
- **API test:** 200, 404, and 400.
- **CLI, on your data, without `--yes`:** the shared Xverse address was refused with both IDs
  listed; a dry run by ID described the removal, and nothing was removed.
- **In headless Chrome:** a throwaway wallet `test-remove-me` (an empty address, Ethereum only,
  added through the CLI, which doesn't sync) was removed with its card's button. The confirmation
  read "Remove "test-remove-me" (EVM, 0x7e57…0001)? …", the card disappeared, and the database had
  no wallet, account, or raw record for it. It ran between sync ticks, so no test data remains.
- `pnpm check` passes: **128 unit tests** and **30 integration tests**.

## Known gaps

- No undo. Re-adding the address restores current balances at the next sync, but not the deleted
  history.
- Venue accounts (Coinbase, Hyperliquid) can't be removed from the dashboard yet.

## Next steps

- Remove the old "XVerse" (Solana) wallet: use its card's Remove button.
