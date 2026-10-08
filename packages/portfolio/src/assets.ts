import { AssetStatus } from '@talewinds/core';
import { type AssetRow, type Db, findAssetById, setAssetStatusManually } from '@talewinds/db';

/**
 * Mark an asset verified, unverified, or spam by hand. Manual decisions override automatic
 * rules from then on, and the change is kept in the asset's status history.
 */
export async function setAssetStatus(
  db: Db,
  assetId: string,
  status: unknown,
  reason: string | null = null,
): Promise<AssetRow> {
  const parsed = AssetStatus.parse(status);
  const existing = await findAssetById(db, assetId);
  if (!existing) throw new Error(`Unknown asset ${assetId}`);
  return setAssetStatusManually(db, assetId, parsed, reason?.trim() || null);
}
