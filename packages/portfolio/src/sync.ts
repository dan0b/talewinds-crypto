import { findChainById, isChainKey, type Note, VENUE_INFO, Venue } from '@talewinds/core';
import {
  type AccountRow,
  finishSyncRun,
  insertBalanceSnapshots,
  knownAssetDecimals,
  ownedVenueAccounts,
  ownedWalletAccounts,
  promoteToVerified,
  saveRawRecords,
  startSyncRun,
  upsertAssets,
} from '@talewinds/db';
import {
  type BalanceContext,
  type BalanceReading,
  type ObservedBalance,
  RequestMeter,
} from '@talewinds/sources';
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

/** The configured reader for a venue account, or null (unknown venue, or no key set). */
function venueSource(deps: PortfolioDeps, account: AccountRow) {
  const venue = Venue.safeParse(account.venue);
  return venue.success
    ? { venue: venue.data, source: deps.sources.venueBalances[venue.data] }
    : null;
}

/** Whether this account can be synced now: every wallet; a venue once its source is configured. */
export function canSync(deps: PortfolioDeps, account: AccountRow): boolean {
  if (account.kind === 'wallet') return true;
  return Boolean(venueSource(deps, account)?.source);
}

/** Read one account: a wallet through its chain's adapter, a venue through its own API. */
async function readBalances(
  deps: PortfolioDeps,
  account: AccountRow,
  meter: RequestMeter,
): Promise<BalanceReading> {
  const lookup =
    (known: Map<string, number>): BalanceContext['known'] =>
    (ref) => {
      const decimals = known.get(ref);
      return decimals === undefined ? undefined : { decimals };
    };

  if (account.kind === 'wallet') {
    const chain = account.chainId ? findChainById(account.chainId) : undefined;
    if (!account.address || !chain || !isChainKey(chain.key)) {
      throw new Error(`Account ${account.ref} is not a wallet on a supported chain`);
    }
    const known = await knownAssetDecimals(deps.db, chain.id);
    return deps.sources.wallets[chain.key].fetchBalances(account.address, {
      meter,
      known: lookup(known),
    });
  }

  const venue = venueSource(deps, account);
  if (!venue?.source) {
    throw new Error(`Syncing ${account.ref} isn't set up (no reader or credentials for it)`);
  }
  const known = await knownAssetDecimals(deps.db, VENUE_INFO[venue.venue].chainId);
  return venue.source.fetchBalances({ address: account.address }, { meter, known: lookup(known) });
}

/**
 * Read one account's balances (a wallet on one chain, or a venue account) and store them as a
 * sync run: raw responses first, then assets and snapshots that link back to them, all in one
 * transaction. Never throws for provider problems: a failure is recorded as a failed run and
 * returned.
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
    const reading = await readBalances(deps, account, meter);

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

/**
 * Sync every owned wallet, then every owned venue account that's set up (e.g. Coinbase once its
 * key is in env), one at a time (free-tier friendly), then refresh prices.
 */
export async function syncAllOwnedAccounts(deps: PortfolioDeps): Promise<SyncAllResult> {
  const [wallets, venues] = await Promise.all([
    ownedWalletAccounts(deps.db),
    ownedVenueAccounts(deps.db),
  ]);
  const accounts = [...wallets, ...venues.filter((a) => canSync(deps, a))];
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
