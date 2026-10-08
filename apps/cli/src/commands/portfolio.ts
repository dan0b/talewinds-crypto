import { findAccountByRef, findAssetByRef } from '@talewinds/db';
import {
  type AccountSyncResult,
  createPortfolioDeps,
  getHoldings,
  refreshPrices,
  setAssetStatus,
  syncAccountBalances,
  syncAllOwnedWallets,
} from '@talewinds/portfolio';
import type { Command } from 'commander';
import { withRuntime } from '../context.ts';

const shortRef = (ref: string) => (ref.length > 48 ? `${ref.slice(0, 24)}…${ref.slice(-12)}` : ref);

function printSyncResults(results: AccountSyncResult[]): void {
  if (results.length === 0) {
    console.log('No owned wallets to sync. Add one with: pnpm tw account add --help');
    return;
  }
  console.table(
    results.map((r) => ({
      account: shortRef(r.ref),
      status: r.status,
      balances: r.balances,
      requests: r.requestCount,
    })),
  );
  for (const r of results) {
    if (r.error) console.log(`  ✗ ${shortRef(r.ref)}: ${r.error}`);
    for (const n of r.notes) console.log(`  • ${shortRef(r.ref)}: ${n.message}`);
  }
}

export function registerPortfolioCommands(program: Command): void {
  program
    .command('sync')
    .description('Sync balances for owned wallets now (in this process), then refresh prices')
    .option('--account <ref>', 'only this account (see `tw account list` for refs)')
    .action(
      withRuntime(async (rt, opts: { account?: string }) => {
        const deps = createPortfolioDeps({ db: rt.database.db, env: rt.env, log: rt.log });
        if (opts.account) {
          const account = await findAccountByRef(rt.database.db, opts.account);
          if (!account) throw new Error(`No account with ref ${opts.account}`);
          printSyncResults([await syncAccountBalances(deps, account)]);
          const prices = await refreshPrices(deps);
          console.log(
            `Prices: ${prices.priced} updated, ${prices.missing} unknown to every source`,
          );
          return;
        }
        const result = await syncAllOwnedWallets(deps);
        printSyncResults(result.accounts);
        console.log(
          result.priceError
            ? `Prices: refresh failed (${result.priceError})`
            : `Prices: ${result.pricesUpdated} updated`,
        );
      }),
    );

  program
    .command('holdings')
    .description('Show current holdings across owned wallets')
    .option('--all', 'include hidden assets (unverified and spam)')
    .action(
      withRuntime(async (rt, opts: { all?: boolean }) => {
        const deps = createPortfolioDeps({ db: rt.database.db, env: rt.env, log: rt.log });
        const view = await getHoldings(deps, { includeHidden: Boolean(opts.all) });
        if (view.holdings.length === 0) {
          console.log('No holdings yet. Register wallets (`tw account add`) and run `tw sync`.');
        } else {
          console.table(
            view.holdings.map((h) => ({
              asset: h.symbol ?? '(unknown)',
              chain: h.chainName,
              amount: h.amount,
              priceUsd: h.price ? `${h.price.usd}${h.price.stale ? ' (stale)' : ''}` : 'no price',
              valueUsd: h.valueUsd ?? '—',
              status: h.status,
              ref: shortRef(h.ref),
            })),
          );
        }
        console.log(`Total (verified, priced): $${view.totals.valueUsd}`);
        if (view.totals.unpricedCount > 0)
          console.log(`  ${view.totals.unpricedCount} verified assets have no price`);
        if (view.hidden.count > 0 && !opts.all) {
          console.log(
            `  ${view.hidden.count} hidden assets (≈ $${view.hidden.estimatedValueUsd} unverified, not counted); see --all`,
          );
        }
        for (const a of view.accounts.filter((x) => x.syncSupported)) {
          const flags = [
            a.stale && 'stale',
            a.incomplete && 'incomplete',
            a.lastRun?.status === 'failed' && 'last sync failed',
          ]
            .filter(Boolean)
            .join(', ');
          if (flags) console.log(`  ! ${shortRef(a.ref)}: ${flags}`);
        }
      }),
    );

  program
    .command('asset')
    .description('Manage assets')
    .command('status')
    .description('Mark an asset verified, unverified, or spam (kept in its history)')
    .argument('<asset>', 'asset CAIP-19 ref, e.g. eip155:1/erc20:0x…')
    .argument('<status>', 'verified | unverified | spam')
    .option('--reason <text>', 'why (kept in the history)')
    .action(
      withRuntime(async (rt, assetRef: string, status: string, opts: { reason?: string }) => {
        const asset = await findAssetByRef(rt.database.db, assetRef);
        if (!asset) throw new Error(`No asset with ref ${assetRef}`);
        const row = await setAssetStatus(rt.database.db, asset.id, status, opts.reason ?? null);
        console.log(`${row.symbol ?? row.ref} is now ${row.status} (manual)`);
      }),
    );
}
