import { type AssetRef, findChainById, isChainKey, type Note } from '@talewinds/core';
import {
  assetsNeedingPrices,
  insertPriceObservations,
  promoteToVerified,
  saveRawRecords,
  setPriceMiss,
} from '@talewinds/db';
import { type PricingInput, RequestMeter } from '@talewinds/sources';
import { nowOf, type PortfolioDeps } from './deps.ts';

export interface PriceRefreshResult {
  priced: number;
  missing: number;
  verified: number;
  requestCount: number;
  notes: Note[];
}

/**
 * Price every asset owned accounts currently hold, with market data. Verified assets go first so
 * request caps cut junk, not holdings. Only a reliable price that agrees with the on-chain market
 * promotes an asset to verified (ADRs 0014, 0015); a pool price alone never does.
 */
export async function refreshPrices(deps: PortfolioDeps): Promise<PriceRefreshResult> {
  const { db } = deps;
  const now = nowOf(deps);
  const rows = await assetsNeedingPrices(
    db,
    new Date(now.getTime() - deps.config.priceMissCooldownMs),
  );

  const byRef = new Map(rows.map((r) => [r.ref, r]));
  const inputs: PricingInput[] = [];
  for (const row of rows) {
    const chain = findChainById(row.chainId);
    if (!chain || !isChainKey(chain.key)) continue;
    inputs.push({
      ref: row.ref as AssetRef,
      chainKey: chain.key,
      kind: row.kind as PricingInput['kind'],
      address: row.address,
    });
  }
  const rank = (ref: string) => {
    const r = byRef.get(ref);
    return (r?.status === 'verified' ? 0 : 2) + (r?.kind === 'native' ? 0 : 1);
  };
  inputs.sort((a, b) => rank(a.ref) - rank(b.ref));

  if (inputs.length === 0)
    return { priced: 0, missing: 0, verified: 0, requestCount: 0, notes: [] };

  const meter = new RequestMeter();
  const reading = await deps.sources.prices.fetchPrices(inputs, { meter });
  const rawIds = await saveRawRecords(db, reading.captures);

  const idOf = (ref: string) => byRef.get(ref)?.id;
  await insertPriceObservations(
    db,
    reading.quotes.flatMap((q) => {
      const assetId = idOf(q.ref);
      const capture = reading.captures[q.captureIndex];
      const rawRecordId = rawIds[q.captureIndex];
      if (!assetId || !capture || !rawRecordId) return [];
      return [
        {
          assetId,
          priceUsd: q.priceUsd,
          source: q.source,
          confidence: q.confidence,
          pricedAt: q.pricedAt,
          fetchedAt: capture.fetchedAt,
          rawRecordId,
          marketCapUsd: q.marketCapUsd,
          fdvUsd: q.fdvUsd,
          liquidityUsd: q.liquidityUsd,
          crossCheckSource: q.crossCheck?.source ?? null,
          crossCheckPriceUsd: q.crossCheck?.priceUsd ?? null,
        },
      ];
    }),
  );

  // Verification needs an independent, reliable price that agrees with the market (ADR 0015).
  const reliable = reading.quotes
    .filter((q) => q.verifies)
    .map((q) => idOf(q.ref))
    .filter((id): id is string => Boolean(id));
  const verified = await promoteToVerified(
    db,
    reliable,
    'priced reliably (DefiLlama high confidence, consistent with the on-chain market)',
  );

  const pricedIds = reading.quotes
    .map((q) => idOf(q.ref))
    .filter((id): id is string => Boolean(id));
  const missingIds = reading.missing
    .map((ref) => idOf(ref))
    .filter((id): id is string => Boolean(id));
  await setPriceMiss(db, pricedIds, null);
  await setPriceMiss(db, missingIds, now);

  return {
    priced: pricedIds.length,
    missing: missingIds.length,
    verified: verified.length,
    requestCount: meter.total,
    notes: reading.notes,
  };
}
