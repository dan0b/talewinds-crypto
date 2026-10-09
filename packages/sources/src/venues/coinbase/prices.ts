import { type AssetRef, Dec, type Note } from '@talewinds/core';
import { z } from 'zod';
import type { ProviderClient } from '../../shared/http.ts';
import type { PriceQuote, PriceReading, RawCapture, VenuePriceSource } from '../../types.ts';

const Products = z.object({
  products: z.array(
    z.object({
      product_id: z.string(),
      price: z.string(),
      status: z.string().optional(),
      trading_disabled: z.boolean().optional(),
    }),
  ),
});

const Rates = z.object({
  data: z.object({ currency: z.literal('USD'), rates: z.record(z.string(), z.string()) }),
});

/** Product IDs per market request. */
const PRODUCTS_BATCH = 20;

const quote = (
  ref: AssetRef,
  priceUsd: string,
  source: string,
  confidence: PriceQuote['confidence'],
  pricedAt: Date,
  captureIndex: number,
): PriceQuote => ({
  ref,
  priceUsd,
  confidence,
  pricedAt,
  source,
  captureIndex,
  marketCapUsd: null,
  fdvUsd: null,
  liquidityUsd: null,
  crossCheck: null,
  // Venue assets are verified when they're read (ADR 0018); a price never needs to vouch.
  verifies: false,
});

/**
 * Prices for Coinbase holdings on Coinbase's own markets (ADR 0018), from its public endpoints
 * (no key): the `<CODE>-USD` market price first; otherwise Coinbase's exchange rate, which is how
 * it values currencies without a USD market (USDC and PYUSD convert 1:1, and USD is the unit).
 */
export function createCoinbasePriceSource(client: ProviderClient): VenuePriceSource {
  return {
    async fetchPrices(inputs, { meter }): Promise<PriceReading> {
      const captures: RawCapture[] = [];
      const keep = (raw: RawCapture) => captures.push(raw) - 1;
      const quotes: PriceQuote[] = [];
      const notes: Note[] = [];
      const coinbase = inputs.filter((i) => i.venue === 'coinbase');
      const missing: AssetRef[] = inputs.filter((i) => i.venue !== 'coinbase').map((i) => i.ref);

      // 1. Markets: the last trade on <CODE>-USD.
      const priced = new Set<string>();
      const marketable = coinbase.filter((i) => i.code !== 'USD');
      for (let i = 0; i < marketable.length; i += PRODUCTS_BATCH) {
        const batch = marketable.slice(i, i + PRODUCTS_BATCH);
        const query = new URLSearchParams(batch.map((b) => ['product_ids', `${b.code}-USD`]));
        const res = await client.getJson(`/api/v3/brokerage/market/products?${query}`, Products, {
          meter,
          requestKey: `market_products(${batch.map((b) => b.code).join(',')})`,
        });
        const index = keep(res.raw);
        const byId = new Map(res.data.products.map((p) => [p.product_id, p]));
        for (const input of batch) {
          const p = byId.get(`${input.code}-USD`);
          if (!p || !/^\d+(\.\d+)?$/.test(p.price) || new Dec(p.price).isZero()) continue;
          const live = p.status === 'online' && !p.trading_disabled;
          quotes.push(
            quote(input.ref, p.price, 'coinbase', live ? 'high' : 'low', res.raw.fetchedAt, index),
          );
          priced.add(input.ref);
        }
      }

      // 2. Exchange rates for the rest (USD, USDC, …): how many units one USD buys.
      const rest = coinbase.filter((i) => !priced.has(i.ref));
      if (rest.length > 0) {
        const res = await client.getJson('/v2/exchange-rates?currency=USD', Rates, {
          meter,
          requestKey: 'exchange_rates(USD)',
        });
        const index = keep(res.raw);
        for (const input of rest) {
          const rate = res.data.data.rates[input.code];
          if (!rate || !/^\d+(\.\d+)?$/.test(rate) || new Dec(rate).isZero()) {
            missing.push(input.ref);
            continue;
          }
          const price = new Dec(1).div(rate).toSignificantDigits(20).toFixed();
          quotes.push(quote(input.ref, price, 'coinbase-rates', 'high', res.raw.fetchedAt, index));
        }
      }

      return { captures, quotes, missing, notes };
    },
  };
}
