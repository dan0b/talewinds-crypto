# 0021 — Value history: replayed from stored balances and prices

- **Status:** Accepted
- **Date:** 2026-10-09

## Context

Step 02f charts the portfolio's value over time. Step 09 had planned daily snapshots of the total.
But every sync already stores its balances (a balance snapshot per run), and every price refresh
stores its prices, each linked to the raw record it came from. A stored total would be a second
copy of those facts. It would also be frozen with the rules of the day it was written: which
tokens were verified, and which wallets existed.

## Decision

- **Value history is computed on request** from balance snapshots and price observations. The
  value at time t is each account's newest usable balances at t, times each asset's newest price at
  t: what the dashboard would have shown then. Nothing new is stored.
- **Today's rules apply to all of history.** Assets verified now count throughout, because a
  token's legitimacy doesn't change over time. The accounts are the ones you track now.
- **Coverage changes are shown, not smoothed over.** A wallet added during the range is marked
  where it first synced. Times when nothing synced are gaps. Nothing is backfilled.
- **The load is per grid step** (`date_bin`), so its cost grows with the number of chart points,
  not with the number of syncs.

## Consequences

- History reaches back to the first sync. It stays consistent when you verify a token or mark one
  as spam: the whole line updates.
- Removing a wallet removes it from history too, because its snapshots are deleted (step 02d).
- The value includes deposits and withdrawals, so it isn't performance. P&L over time still needs
  the ledger (steps 06–09).
- If computing it on request gets slow, a cache that can be rebuilt can be added later without
  changing what the numbers mean.
