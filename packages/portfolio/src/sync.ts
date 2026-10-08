import { findChainById, isChainKey, type Note } from '@talewinds/core';
import {
  type AccountRow,
  finishSyncRun,
  insertBalanceSnapshots,
  knownAssetDecimals,
  ownedWalletAccounts,
  promoteToVerified,
  saveRawRecords,
  startSyncRun,
  upsertAssets,
} from '@talewinds/db';
import { type ObservedBalance, RequestMeter } from '@talewinds/sources';
import { errorMessage, nowOf, type PortfolioDeps } from './deps.ts';
import { refreshPrices } from './prices.ts';

export interface AccountSyncResult {
  accountId: string;
  ref: string;
  status: 'succeeded' | 'partial' | 'failed';
  balances: number;
  notes: Note[];
  requestCount: number;
  error: string | null;
}

/**
 * Read one wallet's balances and store them as a sync run: raw responses first, then assets and
 * snapshots that link back to them, all in one transaction. Never throws for provider problems:
 * a failure is recorded as a failed run and returned.
 */
export async function syncAccountBalances(
  deps: PortfolioDeps,
  account: AccountRow,
): Promise<AccountSyncResult> {
  const { db } = deps;
  const runId = await startSyncRun(db, account.id, nowOf(deps));
  const meter = new RequestMeter();
  const base = { accountId: account.id, ref: account.ref };

  try {
    const chain = account.chainId ? findChainById(account.chainId) : undefined;
    if (account.kind !== 'wallet' || !account.address || !chain || !isChainKey(chain.key)) {
      throw new Error(`Account ${account.ref} is not a wallet on a supported chain`);
    }

    const known = await knownAssetDecimals(db, chain.id);
    const reading = await deps.sources.wallets[chain.key].fetchBalances(account.address, {
      meter,
      known: (ref) => {
        const decimals = known.get(ref);
        return decimals === undefined ? undefined : { decimals };
      },
    });

    // A provider listing the same asset twice would double-count it; keep the first.
    const notes = [...reading.notes];
    const seen = new Set<string>();
    const balances: ObservedBalance[] = [];
    for (const b of reading.balances) {
      if (seen.has(b.asset.ref)) {
        notes.push({
          code: 'duplicate_balance',
          message: `Ignored a duplicate entry for ${b.asset.ref}.`,
        });
        continue;
      }
      seen.add(b.asset.ref);
      balances.push(b);
    }

    const status = reading.complete ? 'succeeded' : 'partial';
    const assetRows = await db.transaction(async (tx) => {
      const rawIds = await saveRawRecords(tx, reading.captures);
      const rows = await upsertAssets(
        tx,
        balances.map((b) => ({
          ref: b.asset.ref,
          chainId: b.asset.chainId,
          kind: b.asset.kind,
          address: b.asset.address,
          symbol: b.asset.symbol,
          name: b.asset.name,
          decimals: b.asset.decimals,
          decimalsSource: b.asset.decimalsSource,
          metadataSource: b.asset.metadataSource,
          initialStatus: b.asset.providerVerified ? 'verified' : 'unverified',
        })),
      );
      await insertBalanceSnapshots(
        tx,
        balances.map((b) => {
          const capture = reading.captures[b.captureIndex];
          const assetRow = rows.get(b.asset.ref);
          const rawRecordId = rawIds[b.captureIndex];
          if (!capture || !assetRow || !rawRecordId)
            throw new Error(`Lost track of ${b.asset.ref}`);
          return {
            syncRunId: runId,
            accountId: account.id,
            assetId: assetRow.id,
            rawAmount: b.rawAmount,
            observedAt: capture.fetchedAt,
            rawRecordId,
          };
        }),
      );
      await finishSyncRun(tx, runId, {
        status,
        notes,
        requestCount: meter.total,
        finishedAt: nowOf(deps),
      });
      return rows;
    });

    // Provider-verified assets seen before as unverified (e.g. newly Jupiter-verified) get promoted.
    const vouched = balances
      .filter((b) => b.asset.providerVerified)
      .map((b) => assetRows.get(b.asset.ref)?.id)
      .filter((id): id is string => Boolean(id));
    await promoteToVerified(db, vouched, 'verified by provider');

    return {
      ...base,
      status,
      balances: balances.length,
      notes,
      requestCount: meter.total,
      error: null,
    };
  } catch (err) {
    const error = errorMessage(err);
    await finishSyncRun(db, runId, {
      status: 'failed',
      notes: [],
      requestCount: meter.total,
      error,
      finishedAt: nowOf(deps),
    });
    deps.log.warn({ account: account.ref, error }, 'balance sync failed');
    return { ...base, status: 'failed', balances: 0, notes: [], requestCount: meter.total, error };
  }
}

export interface SyncAllResult {
  accounts: AccountSyncResult[];
  succeeded: number;
  partial: number;
  failed: number;
  pricesUpdated: number;
  priceError: string | null;
}

/** Sync every owned wallet, one at a time (free-tier friendly), then refresh prices. */
export async function syncAllOwnedWallets(deps: PortfolioDeps): Promise<SyncAllResult> {
  const accounts = await ownedWalletAccounts(deps.db);
  const results: AccountSyncResult[] = [];
  for (const account of accounts) {
    results.push(await syncAccountBalances(deps, account));
  }

  let pricesUpdated = 0;
  let priceError: string | null = null;
  try {
    pricesUpdated = (await refreshPrices(deps)).priced;
  } catch (err) {
    priceError = errorMessage(err);
    deps.log.warn({ error: priceError }, 'price refresh failed');
  }

  const count = (s: AccountSyncResult['status']) => results.filter((r) => r.status === s).length;
  return {
    accounts: results,
    succeeded: count('succeeded'),
    partial: count('partial'),
    failed: count('failed'),
    pricesUpdated,
    priceError,
  };
}
