import type { AssetKind, AssetStatus } from '@talewinds/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db, Executor } from '../client.ts';
import { assetStatusHistory, assets } from '../schema/index.ts';
import { chunk } from '../util.ts';

export type AssetRow = typeof assets.$inferSelect;

export interface AssetInput {
  ref: string;
  chainId: string;
  kind: AssetKind;
  address: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number;
  decimalsSource: string;
  metadataSource: string | null;
  /** Status for a newly seen asset. Existing assets keep theirs. */
  initialStatus: AssetStatus;
}

/**
 * Insert new assets and refresh display metadata of known ones. Never changes an existing
 * asset's decimals or status. Returns ref → asset row for every input.
 */
export async function upsertAssets(
  db: Executor,
  inputs: AssetInput[],
): Promise<Map<string, AssetRow>> {
  const unique = [...new Map(inputs.map((a) => [a.ref, a])).values()];

  for (const batch of chunk(unique, 500)) {
    await db
      .insert(assets)
      .values(
        batch.map(({ initialStatus, ...a }) => ({
          ...a,
          status: initialStatus,
          statusSource: 'auto',
        })),
      )
      .onConflictDoUpdate({
        target: assets.ref,
        set: {
          symbol: sql`coalesce(excluded.symbol, ${assets.symbol})`,
          name: sql`coalesce(excluded.name, ${assets.name})`,
          metadataSource: sql`coalesce(excluded.metadata_source, ${assets.metadataSource})`,
          updatedAt: sql`now()`,
        },
        // Skip the write entirely when nothing would change.
        setWhere: sql`(excluded.symbol is not null and excluded.symbol is distinct from ${assets.symbol})
          or (excluded.name is not null and excluded.name is distinct from ${assets.name})`,
      });
  }

  const byRef = new Map<string, AssetRow>();
  for (const batch of chunk(
    unique.map((a) => a.ref),
    1000,
  )) {
    const rows = await db.select().from(assets).where(inArray(assets.ref, batch));
    for (const row of rows) byRef.set(row.ref, row);
  }
  return byRef;
}

/**
 * Automatic promotion to `verified` (e.g. reliably priced, provider-verified). Only touches
 * assets that are `unverified` with an automatic status, so manual decisions always win.
 * Returns the IDs that changed.
 */
export async function promoteToVerified(
  db: Db,
  assetIds: string[],
  reason: string,
): Promise<string[]> {
  if (assetIds.length === 0) return [];
  return db.transaction(async (tx) => {
    const changed: string[] = [];
    for (const batch of chunk(assetIds, 1000)) {
      const rows = await tx
        .update(assets)
        .set({ status: 'verified' })
        .where(
          and(
            inArray(assets.id, batch),
            eq(assets.status, 'unverified'),
            eq(assets.statusSource, 'auto'),
          ),
        )
        .returning({ id: assets.id });
      changed.push(...rows.map((r) => r.id));
    }
    if (changed.length > 0) {
      await tx
        .insert(assetStatusHistory)
        .values(
          changed.map((assetId) => ({ assetId, status: 'verified', source: 'auto', reason })),
        );
    }
    return changed;
  });
}

/** A manual status decision. It overrides automatic rules from now on, and is kept in history. */
export async function setAssetStatusManually(
  db: Db,
  assetId: string,
  status: AssetStatus,
  reason: string | null,
): Promise<AssetRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(assets)
      .set({ status, statusSource: 'manual' })
      .where(eq(assets.id, assetId))
      .returning();
    if (!row) throw new Error(`Unknown asset ${assetId}`);
    await tx.insert(assetStatusHistory).values({ assetId, status, source: 'manual', reason });
    return row;
  });
}

export async function assetStatusHistoryFor(db: Executor, assetId: string) {
  return db
    .select()
    .from(assetStatusHistory)
    .where(eq(assetStatusHistory.assetId, assetId))
    .orderBy(assetStatusHistory.createdAt);
}

export async function findAssetByRef(db: Executor, ref: string): Promise<AssetRow | null> {
  const [row] = await db.select().from(assets).where(eq(assets.ref, ref));
  return row ?? null;
}

/** Record that no price source knew these assets, or clear that mark when one did. */
export async function setPriceMiss(
  db: Executor,
  assetIds: string[],
  at: Date | null,
): Promise<void> {
  for (const batch of chunk(assetIds, 1000)) {
    await db.update(assets).set({ priceMissAt: at }).where(inArray(assets.id, batch));
  }
}

/** Decimals of every asset already known on a chain, so adapters can skip metadata lookups. */
export async function knownAssetDecimals(
  db: Executor,
  chainId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ ref: assets.ref, decimals: assets.decimals })
    .from(assets)
    .where(eq(assets.chainId, chainId));
  return new Map(rows.map((r) => [r.ref, r.decimals]));
}

export async function findAssetById(db: Executor, id: string): Promise<AssetRow | null> {
  const [row] = await db.select().from(assets).where(eq(assets.id, id));
  return row ?? null;
}
