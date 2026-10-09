import { type AssetRef, Dec, type Note } from '@talewinds/core';
import { z } from 'zod';
import { HIGH_CONFIDENCE_LIQUIDITY_USD } from '../../prices/dexscreener.ts';
import type { ProviderClient } from '../../shared/http.ts';
import type { RequestMeter } from '../../shared/meter.ts';
import type { PriceQuote, PriceReading, RawCapture, VenuePriceSource } from '../../types.ts';
import { HYPERLIQUID_QUOTE } from './index.ts';

const SpotMeta = z.object({
  tokens: z.array(z.object({ name: z.string(), index: z.number() })),
  universe: z.array(z.object({ name: z.string(), tokens: z.tuple([z.number(), z.number()]) })),
});

const Level = z.object({ px: z.string(), sz: z.string() });
const Book = z.object({
  coin: z.string(),
  time: z.number(),
  levels: z.tuple([z.array(Level), z.array(Level)]),
});

/** Spot metadata (token names → markets) changes rarely; refetch at most this often. */
const META_TTL_MS = 60 * 60_000;

/**
 * Prices for Hyperliquid holdings on Hyperliquid's own spot markets (ADR 0018), from its public
 * info API: each token's market against USDC, at the order book's mid. Liquidity is the bid side's
 * depth, i.e. what selling into the book could absorb. USDC is the quote currency every market
 * and the perps account are denominated in, so it's 1 by definition (cited to the metadata).
 */
export function createHyperliquidPriceSource(client: ProviderClient): VenuePriceSource {
  let cached: { at: number; markets: Map<string, string>; raw: RawCapture } | null = null;

  const marketsFor = async (meter: RequestMeter) => {
    if (cached && Date.now() - cached.at < META_TTL_MS) return cached;
    const res = await client.postJson('/info', { type: 'spotMeta' }, SpotMeta, {
      meter,
      requestKey: 'spotMeta',
    });
    const quote = res.data.tokens.find((t) => t.name === HYPERLIQUID_QUOTE)?.index;
    const nameOf = new Map(res.data.tokens.map((t) => [t.index, t.name]));
    const markets = new Map<string, string>();
    for (const m of res.data.universe) {
      const base = nameOf.get(m.tokens[0]);
      // Markets are matched by token index from the metadata, never by a market's display name.
      if (base && m.tokens[1] === quote && !markets.has(base)) markets.set(base, m.name);
    }
    cached = { at: Date.now(), markets, raw: res.raw };
    return cached;
  };

  return {
    async fetchPrices(inputs, { meter }): Promise<PriceReading> {
      const captures: RawCapture[] = [];
      const keep = (raw: RawCapture) => captures.push(raw) - 1;
      const quotes: PriceQuote[] = [];
      const notes: Note[] = [];
      const missing: AssetRef[] = [];
      const mine = inputs.filter((i) => i.venue === 'hyperliquid');
      if (mine.length === 0) return { captures, quotes, missing, notes };

      const meta = await marketsFor(meter);
      const metaIndex = keep(meta.raw);
      for (const input of mine) {
        const base = {
          ref: input.ref,
          marketCapUsd: null,
          fdvUsd: null,
          crossCheck: null,
          // Venue assets are verified when they're read (ADR 0018).
          verifies: false,
        };
        if (input.code === HYPERLIQUID_QUOTE) {
          quotes.push({
            ...base,
            priceUsd: '1',
            confidence: 'high',
            pricedAt: meta.raw.fetchedAt,
            source: 'hyperliquid-quote',
            captureIndex: metaIndex,
            liquidityUsd: null,
          });
          continue;
        }
        const market = meta.markets.get(input.code);
        if (!market) {
          missing.push(input.ref);
          continue;
        }
        const book = await client.postJson('/info', { type: 'l2Book', coin: market }, Book, {
          meter,
          requestKey: `l2Book(${market})`,
        });
        const index = keep(book.raw);
        const [bids, asks] = book.data.levels;
        const bid = bids[0];
        const ask = asks[0];
        if (!bid || !ask) {
          missing.push(input.ref);
          continue;
        }
        const mid = new Dec(bid.px).plus(ask.px).div(2);
        const depth = bids.reduce((s, l) => s.plus(new Dec(l.px).times(l.sz)), new Dec(0));
        quotes.push({
          ...base,
          priceUsd: mid.toFixed(),
          confidence: depth.gte(HIGH_CONFIDENCE_LIQUIDITY_USD) ? 'high' : 'low',
          pricedAt: new Date(book.data.time),
          source: 'hyperliquid',
          captureIndex: index,
          liquidityUsd: depth.toFixed(2),
        });
      }
      return { captures, quotes, missing, notes };
    },
  };
}
