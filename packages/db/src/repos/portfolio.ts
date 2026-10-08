import type { PriceConfidence } from '@talewinds/core';
import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { Executor } from '../client.ts';
import {
  accounts,
  assets,
  balanceSnapshots,
  priceObservations,
  type SyncNote,
  syncRuns,
} from '../schema/index.ts';
import { chunk } from '../util.ts';

export type SyncRunRow = typeof syncRuns.$inferSelect;
export type SyncStatus = 'running' | 'succeeded' | 'partial' | 'failed';

/** Runs whose balances can be shown: they finished, possibly with gaps. */
const USABLE: SyncStatus[] = ['succeeded', 'partial'];

/** Subquery: the newest usable run for each account. */
function latestUsableRuns(db: Executor) {
  return db
    .selectDistinctOn([syncRuns.accountId], { id: syncRuns.id })
    .from(syncRuns)
    .where(inArray(syncRuns.status, USABLE))
    .orderBy(syncRuns.accountId, desc(syncRuns.startedAt))
    .as('latest_runs');
}

export async function startSyncRun(db: Executor, accountId: string, startedAt: Date) {
  const [row] = await db
    .insert(syncRuns)
    .values({ accountId, kind: 'balances', status: 'running', startedAt })
    .returning({ id: syncRuns.id });
  if (!row) throw new Error('Could not start sync run');
  return row.id;
}

export async function finishSyncRun(
  db: Executor,
  runId: string,
  result: {
    status: Exclude<SyncStatus, 'running'>;
    notes: SyncNote[];
    requestCount: number;
    error?: string | null;
    finishedAt: Date;
  },
): Promise<void> {
  await db
    .update(syncRuns)
    .set({
      status: result.status,
      notes: result.notes,
      requestCount: result.requestCount,
      error: result.error ?? null,
      finishedAt: result.finishedAt,
    })
    .where(eq(syncRuns.id, runId));
}

/** Runs left `running` by a crashed process. Marks them failed so they don't look in progress. */
export async function failInterruptedRuns(db: Executor, startedBefore: Date): Promise<number> {
  const rows = await db
    .update(syncRuns)
    .set({
      status: 'failed',
      error: 'interrupted (process stopped mid-sync)',
      finishedAt: sql`now()`,
    })
    .where(and(eq(syncRuns.status, 'running'), lt(syncRuns.startedAt, startedBefore)))
    .returning({ id: syncRuns.id });
  return rows.length;
}

export interface SnapshotInput {
  syncRunId: string;
  accountId: string;
  assetId: string;
  rawAmount: bigint;
  observedAt: Date;
  rawRecordId: string;
}

export async function insertBalanceSnapshots(db: Executor, rows: SnapshotInput[]): Promise<void> {
  for (const batch of chunk(rows, 1000)) {
    await db
      .insert(balanceSnapshots)
      .values(batch.map((r) => ({ ...r, rawAmount: r.rawAmount.toString() })));
  }
}

export interface AccountSyncState {
  accountId: string;
  latest: SyncRunRow | null;
  /** The newest run whose balances can be shown (succeeded or partial). */
  latestUsable: SyncRunRow | null;
}

/** Latest run and latest usable run per account. */
export async function syncStateByAccount(
  db: Executor,
  accountIds: string[],
): Promise<Map<string, AccountSyncState>> {
  const state = new Map<string, AccountSyncState>(
    accountIds.map((id) => [id, { accountId: id, latest: null, latestUsable: null }]),
  );
  if (accountIds.length === 0) return state;

  const latest = await db
    .selectDistinctOn([syncRuns.accountId])
    .from(syncRuns)
    .where(inArray(syncRuns.accountId, accountIds))
    .orderBy(syncRuns.accountId, desc(syncRuns.startedAt));
  const usable = await db
    .selectDistinctOn([syncRuns.accountId])
    .from(syncRuns)
    .where(and(inArray(syncRuns.accountId, accountIds), inArray(syncRuns.status, USABLE)))
    .orderBy(syncRuns.accountId, desc(syncRuns.startedAt));

  for (const r of latest) {
    const s = state.get(r.accountId);
    if (s) s.latest = r;
  }
  for (const r of usable) {
    const s = state.get(r.accountId);
    if (s) s.latestUsable = r;
  }
  return state;
}

/** Every balance from each owned account's latest usable run, joined with its asset. */
export async function currentOwnedBalances(db: Executor) {
  const latestRuns = latestUsableRuns(db);

  return db
    .select({
      accountId: balanceSnapshots.accountId,
      assetId: assets.id,
      assetRef: assets.ref,
      chainId: assets.chainId,
      kind: assets.kind,
      address: assets.address,
      symbol: assets.symbol,
      name: assets.name,
      decimals: assets.decimals,
      status: assets.status,
      statusSource: assets.statusSource,
      rawAmount: balanceSnapshots.rawAmount,
      observedAt: balanceSnapshots.observedAt,
      rawRecordId: balanceSnapshots.rawRecordId,
    })
    .from(balanceSnapshots)
    .innerJoin(latestRuns, eq(balanceSnapshots.syncRunId, latestRuns.id))
    .innerJoin(accounts, eq(balanceSnapshots.accountId, accounts.id))
    .innerJoin(assets, eq(balanceSnapshots.assetId, assets.id))
    .where(eq(accounts.ownership, 'owned'));
}

export type CurrentBalanceRow = Awaited<ReturnType<typeof currentOwnedBalances>>[number];

/**
 * Assets currently held by owned accounts that are worth pricing: not spam, and not recently
 * confirmed unknown to every price source.
 */
export async function assetsNeedingPrices(db: Executor, missCooldownStart: Date) {
  const latestRuns = latestUsableRuns(db);
  const held = db
    .selectDistinct({ assetId: balanceSnapshots.assetId })
    .from(balanceSnapshots)
    .innerJoin(latestRuns, eq(balanceSnapshots.syncRunId, latestRuns.id))
    .innerJoin(accounts, eq(balanceSnapshots.accountId, accounts.id))
    .where(eq(accounts.ownership, 'owned'))
    .as('held');

  return db
    .select()
    .from(assets)
    .innerJoin(held, eq(held.assetId, assets.id))
    .where(
      and(
        ne(assets.status, 'spam'),
        or(isNull(assets.priceMissAt), lt(assets.priceMissAt, missCooldownStart)),
      ),
    )
    .then((rows) => rows.map((r) => r.assets));
}

export interface PriceInput {
  assetId: string;
  priceUsd: string;
  source: string;
  confidence: PriceConfidence;
  pricedAt: Date;
  fetchedAt: Date;
  rawRecordId: string;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  liquidityUsd: string | null;
  crossCheckSource: string | null;
  crossCheckPriceUsd: string | null;
}

export async function insertPriceObservations(db: Executor, rows: PriceInput[]): Promise<void> {
  for (const batch of chunk(rows, 1000)) {
    await db.insert(priceObservations).values(batch);
  }
}

export type LatestPrice = {
  assetId: string;
  priceUsd: string;
  source: string;
  confidence: string;
  pricedAt: Date;
  marketCapUsd: string | null;
  fdvUsd: string | null;
  liquidityUsd: string | null;
  crossCheckSource: string | null;
  crossCheckPriceUsd: string | null;
};

/** The most recent price per asset (by when the price was valid). */
export async function latestPrices(
  db: Executor,
  assetIds: string[],
): Promise<Map<string, LatestPrice>> {
  const out = new Map<string, LatestPrice>();
  for (const batch of chunk(assetIds, 1000)) {
    const rows = await db
      .selectDistinctOn([priceObservations.assetId], {
        assetId: priceObservations.assetId,
        priceUsd: priceObservations.priceUsd,
        source: priceObservations.source,
        confidence: priceObservations.confidence,
        pricedAt: priceObservations.pricedAt,
        marketCapUsd: priceObservations.marketCapUsd,
        fdvUsd: priceObservations.fdvUsd,
        liquidityUsd: priceObservations.liquidityUsd,
        crossCheckSource: priceObservations.crossCheckSource,
        crossCheckPriceUsd: priceObservations.crossCheckPriceUsd,
      })
      .from(priceObservations)
      .where(inArray(priceObservations.assetId, batch))
      .orderBy(priceObservations.assetId, desc(priceObservations.pricedAt));
    for (const r of rows) out.set(r.assetId, r);
  }
  return out;
}

/** Owned wallet accounts (the ones step 01 syncs). */
export async function ownedWalletAccounts(db: Executor) {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.ownership, 'owned'), eq(accounts.kind, 'wallet')))
    .orderBy(accounts.createdAt);
}

export async function recentSyncRuns(db: Executor, since: Date) {
  return db
    .select()
    .from(syncRuns)
    .where(gt(syncRuns.startedAt, since))
    .orderBy(desc(syncRuns.startedAt));
}
