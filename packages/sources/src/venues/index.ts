import { type AssetRef, type Note, VENUES, type Venue } from '@talewinds/core';
import type { PriceQuote, PriceReading, RawCapture, VenuePriceSource } from '../types.ts';

/**
 * One price source for every venue: each venue's holdings are priced on its own markets
 * (ADR 0018). A venue whose prices can't be fetched right now becomes a note, and its assets are
 * not marked missing (that would put them on the 24-hour cooldown for a passing outage).
 */
export function combineVenuePrices(
  sources: Partial<Record<Venue, VenuePriceSource>>,
): VenuePriceSource {
  return {
    async fetchPrices(inputs, ctx): Promise<PriceReading> {
      const captures: RawCapture[] = [];
      const quotes: PriceQuote[] = [];
      const missing: AssetRef[] = [];
      const notes: Note[] = [];
      for (const venue of VENUES) {
        const mine = inputs.filter((i) => i.venue === venue);
        if (mine.length === 0) continue;
        const source = sources[venue];
        if (!source) {
          missing.push(...mine.map((i) => i.ref));
          continue;
        }
        let reading: PriceReading;
        try {
          reading = await source.fetchPrices(mine, ctx);
        } catch (err) {
          notes.push({
            code: 'price_source_failed',
            message: `${venue} prices: ${err instanceof Error ? err.message : 'unknown error'}`,
          });
          continue;
        }
        const offset = captures.length;
        captures.push(...reading.captures);
        quotes.push(
          ...reading.quotes.map((q) => ({ ...q, captureIndex: q.captureIndex + offset })),
        );
        missing.push(...reading.missing);
        notes.push(...reading.notes);
      }
      return { captures, quotes, missing, notes };
    },
  };
}
