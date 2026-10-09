import {
  type AssetRef,
  findChainById,
  isChainKey,
  type Note,
  parseVenueAssetRef,
} from '@talewinds/core';
import {
  assetsNeedingPrices,
  insertPriceObservations,
  promoteToVerified,
  saveRawRecords,
  setPriceMiss,
} from '@talewinds/db';
import {
  type PriceReading,
  type PricingInput,
  RequestMeter,
  type VenuePricingInput,
} from '@talewinds/sources';
import { errorMessage, nowOf, type PortfolioDeps } from './deps.ts';

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
 * promotes an asset to verified (ADRs 0014, 0015); a pool price alone never does. Venue assets are
 * priced on their venue's own market (ADR 0018). Each source is fetched and stored on its own, so
 * one being down doesn't block the others.
 */
export async function refreshPrices(deps: PortfolioDeps): Promise<PriceRefreshResult> {
  const { db } = deps;
  const now = nowOf(deps);
  const rows = await assetsNeedingPrices(
    db,
    new Date(now.getTime() - deps.config.priceMissCooldownMs),
  );

  const byRef = new Map(rows.map((r) => [r.ref, r]));
  const chainInputs: PricingInput[] = [];
  const venueInputs: VenuePricingInput[] = [];
  for (const row of rows) {
    const venue = parseVenueAssetRef(row.ref);
    if (venue) {
      venueInputs.push({ ref: row.ref as AssetRef, venue: venue.venue, code: venue.code });
      continue;
    }
    const chain = findChainById(row.chainId);
    if (!chain || !isChainKey(chain.key) || row.kind === 'venue') continue;
    chainInputs.push({
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
  chainInputs.sort((a, b) => rank(a.ref) - rank(b.ref));

  const result: PriceRefreshResult = {
    priced: 0,
    missing: 0,
    verified: 0,
    requestCount: 0,
    notes: [],
  };
  const jobs: { name: string; fetch: (meter: RequestMeter) => Promise<PriceReading> }[] = [];
  if (chainInputs.length > 0)
    jobs.push({
      name: 'on-chain',
      fetch: (meter) => deps.sources.prices.fetchPrices(chainInputs, { meter }),
    });
  if (venueInputs.length > 0)
    jobs.push({
      name: 'venue',
      fetch: (meter) => deps.sources.venuePrices.fetchPrices(venueInputs, { meter }),
    });
  if (jobs.length === 0) return result;

  const idOf = (ref: string) => byRef.get(ref)?.id;
  const meter = new RequestMeter();
  const failures: string[] = [];
  for (const job of jobs) {
    let reading: PriceReading;
    try {
      reading = await job.fetch(meter);
    } catch (err) {
      failures.push(`${job.name} prices: ${errorMessage(err)}`);
      continue;
    }
    const rawIds = await saveRawRecords(db, reading.captures);
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

    result.priced += pricedIds.length;
    result.missing += missingIds.length;
    result.verified += verified.length;
    result.notes.push(...reading.notes);
  }
  result.requestCount = meter.total;

  // Every source failing is a failed refresh; one failing among several is a note.
  if (failures.length === jobs.length) throw new Error(failures.join('; '));
  for (const message of failures) result.notes.push({ code: 'price_source_failed', message });
  return result;
}
