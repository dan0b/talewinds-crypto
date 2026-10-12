import type { PriceConfidence } from '@talewinds/core';
import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  min,
  ne,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
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

export type PriceObservationPoint = {
  assetId: string;
  priceUsd: string;
  source: string;
  pricedAt: Date;
};

/** Every price observed for these assets with `pricedAt` in [from, to] (e.g. 24h baselines). */
export async function priceObservationsBetween(
  db: Executor,
  assetIds: string[],
  from: Date,
  to: Date,
): Promise<PriceObservationPoint[]> {
  const out: PriceObservationPoint[] = [];
  for (const batch of chunk(assetIds, 1000)) {
    const rows = await db
      .select({
        assetId: priceObservations.assetId,
        priceUsd: priceObservations.priceUsd,
        source: priceObservations.source,
        pricedAt: priceObservations.pricedAt,
      })
      .from(priceObservations)
      .where(
        and(
          inArray(priceObservations.assetId, batch),
          gte(priceObservations.pricedAt, from),
          lte(priceObservations.pricedAt, to),
        ),
      );
    out.push(...rows);
  }
  return out;
}

/** Owned venue accounts (Coinbase, Hyperliquid), read through their venue's API (step 02). */
export async function ownedVenueAccounts(db: Executor) {
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.ownership, 'owned'), eq(accounts.kind, 'venue')))
    .orderBy(accounts.createdAt);
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

// --- Value history (step 02f): only what a chart's grid needs, not every run and price ---

/** A usable run as value history reads it. `finishedAt` is when its balances became known. */
export interface UsableRun {
  id: string;
  accountId: string;
  /** `succeeded`, or `partial`: it couldn't see every balance (its notes say what). */
  status: string;
  startedAt: Date;
  finishedAt: Date;
}

/** One balance a run recorded, with its asset's decimals and current status. */
export interface RunSnapshot {
  syncRunId: string;
  accountId: string;
  assetId: string;
  rawAmount: string;
  decimals: number;
  status: string;
}

/** When a run's balances became known (a usable run always has `finished_at`). */
const runKnownAt = () =>
  sql<Date>`coalesce(${syncRuns.finishedAt}, ${syncRuns.startedAt})`.mapWith(syncRuns.finishedAt);

/**
 * The `stepMs`-wide step a timestamp falls in, counted from the Unix epoch (UTC). The stride is
 * written into the SQL rather than bound: DISTINCT ON and ORDER BY must repeat the same
 * expression, and two bound parameters never compare equal.
 */
function stepOf(timestamp: SQLWrapper, stepMs: number): SQL {
  if (!Number.isSafeInteger(stepMs) || stepMs <= 0) throw new Error(`Invalid step: ${stepMs} ms`);
  return sql`date_bin(${sql.raw(`'${stepMs} milliseconds'::interval`)}, ${timestamp}, ${sql.raw(`timestamptz '1970-01-01 00:00:00+00'`)})`;
}

/**
 * Per account: its newest usable run (by start) in each `stepMs` step of (from, to], by when the
 * run finished, plus its newest usable run finished by `from`.
 */
export async function usableRunsPerStep(
  db: Executor,
  accountIds: string[],
  from: Date,
  to: Date,
  stepMs: number,
): Promise<UsableRun[]> {
  const fields = () => ({
    id: syncRuns.id,
    accountId: syncRuns.accountId,
    status: syncRuns.status,
    startedAt: syncRuns.startedAt,
    finishedAt: runKnownAt(),
  });
  const knownBy = (t: Date) => sql`${runKnownAt()} <= ${t.toISOString()}::timestamptz`;
  const out: UsableRun[] = [];
  for (const batch of chunk(accountIds, 1000)) {
    const usable = () => and(inArray(syncRuns.accountId, batch), inArray(syncRuns.status, USABLE));
    const before = await db
      .selectDistinctOn([syncRuns.accountId], fields())
      .from(syncRuns)
      .where(and(usable(), knownBy(from)))
      .orderBy(syncRuns.accountId, desc(syncRuns.startedAt));
    const step = stepOf(runKnownAt(), stepMs);
    const within = await db
      .selectDistinctOn([syncRuns.accountId, step], fields())
      .from(syncRuns)
      .where(and(usable(), sql`${runKnownAt()} > ${from.toISOString()}::timestamptz`, knownBy(to)))
      .orderBy(syncRuns.accountId, step, desc(syncRuns.startedAt));
    out.push(...before, ...within);
  }
  return out;
}

/** The balances these runs recorded, with each asset's decimals and current status. */
export async function snapshotsOfRuns(db: Executor, runIds: string[]): Promise<RunSnapshot[]> {
  const out: RunSnapshot[] = [];
  for (const batch of chunk([...new Set(runIds)], 1000)) {
    const rows = await db
      .select({
        syncRunId: balanceSnapshots.syncRunId,
        accountId: balanceSnapshots.accountId,
        assetId: balanceSnapshots.assetId,
        rawAmount: balanceSnapshots.rawAmount,
        decimals: assets.decimals,
        status: assets.status,
      })
      .from(balanceSnapshots)
      .innerJoin(assets, eq(balanceSnapshots.assetId, assets.id))
      .where(inArray(balanceSnapshots.syncRunId, batch));
    out.push(...rows);
  }
  return out;
}

/**
 * Per asset: its newest price (by `pricedAt`) in each `stepMs` step after `from`, plus its newest
 * at or before `from`. Deliberately not capped at "now": a price stamped slightly ahead of our
 * clock is still the latest one, as `latestPrices` treats it.
 */
export async function pricesPerStep(
  db: Executor,
  assetIds: string[],
  from: Date,
  stepMs: number,
): Promise<PriceObservationPoint[]> {
  const fields = {
    assetId: priceObservations.assetId,
    priceUsd: priceObservations.priceUsd,
    source: priceObservations.source,
    pricedAt: priceObservations.pricedAt,
  };
  const out: PriceObservationPoint[] = [];
  for (const batch of chunk(assetIds, 1000)) {
    const before = await db
      .selectDistinctOn([priceObservations.assetId], fields)
      .from(priceObservations)
      .where(and(inArray(priceObservations.assetId, batch), lte(priceObservations.pricedAt, from)))
      .orderBy(priceObservations.assetId, desc(priceObservations.pricedAt));
    const step = stepOf(priceObservations.pricedAt, stepMs);
    const after = await db
      .selectDistinctOn([priceObservations.assetId, step], fields)
      .from(priceObservations)
      .where(and(inArray(priceObservations.assetId, batch), gt(priceObservations.pricedAt, from)))
      .orderBy(priceObservations.assetId, step, desc(priceObservations.pricedAt));
    out.push(...before, ...after);
  }
  return out;
}

/** When each account's first usable run finished. Accounts without one are left out. */
export async function firstUsableRunAt(
  db: Executor,
  accountIds: string[],
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  for (const batch of chunk(accountIds, 1000)) {
    const rows = await db
      .select({
        accountId: syncRuns.accountId,
        at: min(runKnownAt()).mapWith(syncRuns.finishedAt),
      })
      .from(syncRuns)
      .where(and(inArray(syncRuns.accountId, batch), inArray(syncRuns.status, USABLE)))
      .groupBy(syncRuns.accountId);
    for (const r of rows) if (r.at) out.set(r.accountId, r.at);
  }
  return out;
}
