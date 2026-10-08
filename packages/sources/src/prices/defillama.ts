import type { PriceConfidence } from '@talewinds/core';
import { z } from 'zod';
import { CHAIN_PROVIDERS } from '../config.ts';
import type { Fetched, ProviderClient } from '../shared/http.ts';
import type { RequestMeter } from '../shared/meter.ts';
import type { PricingInput } from '../types.ts';

const CurrentPrices = z.object({
  coins: z.record(
    z.string(),
    z.object({
      price: z.number().positive(),
      timestamp: z.number().int().positive(),
      confidence: z.number().min(0).max(1).optional(),
      symbol: z.string().optional(),
      decimals: z.number().optional(),
    }),
  ),
});

/** Coin IDs per request; keeps the URL comfortably short. */
export const DEFILLAMA_BATCH = 50;

/** DefiLlama's own confidence score at or above which we call a price high-confidence. */
const HIGH_CONFIDENCE = 0.9;

/** DefiLlama coin ID: `coingecko:<id>` for native assets, `<chain>:<address>` for tokens. */
export function defillamaCoinId(input: PricingInput): string {
  const cfg = CHAIN_PROVIDERS[input.chainKey];
  return input.kind === 'native'
    ? `coingecko:${cfg.nativeCoingeckoId}`
    : `${cfg.defillamaChain}:${input.address}`;
}

export interface LlamaPrice {
  priceUsd: string;
  confidence: PriceConfidence;
  pricedAt: Date;
}

export async function defillamaPrices(
  client: ProviderClient,
  inputs: PricingInput[],
  meter: RequestMeter,
): Promise<Fetched<Map<string, LlamaPrice>>> {
  const ids = [...new Set(inputs.map(defillamaCoinId))];
  const res = await client.getJson(
    `/prices/current/${ids.map(encodeURIComponent).join(',')}`,
    CurrentPrices,
    {
      meter,
      requestKey: `GET /prices/current/${ids.join(',')}`,
    },
  );

  // EVM addresses are case-insensitive; DefiLlama echoes whatever case was sent.
  const found = new Map<string, LlamaPrice>();
  const byLowerId = new Map(Object.entries(res.data.coins).map(([id, v]) => [id.toLowerCase(), v]));
  for (const input of inputs) {
    const id = defillamaCoinId(input);
    const coin = res.data.coins[id] ?? byLowerId.get(id.toLowerCase());
    if (!coin) continue;
    found.set(input.ref, {
      priceUsd: String(coin.price),
      confidence: (coin.confidence ?? 0) >= HIGH_CONFIDENCE ? 'high' : 'low',
      pricedAt: new Date(coin.timestamp * 1000),
    });
  }
  return { data: found, raw: res.raw };
}

const Mcaps = z.record(
  z.string(),
  z.object({ mcap: z.number().nonnegative(), timestamp: z.number().int().positive() }),
);

/** Market caps by CoinGecko ID (DefiLlama only covers CoinGecko-listed coins here). */
export async function defillamaMarketCaps(
  client: ProviderClient,
  coingeckoIds: string[],
  meter: RequestMeter,
): Promise<Fetched<Map<string, number>>> {
  const coins = [...new Set(coingeckoIds)].map((id) => `coingecko:${id}`);
  const res = await client.postJson('/mcaps', { coins }, Mcaps, {
    meter,
    requestKey: `POST /mcaps ${coins.join(',')}`,
  });
  return {
    data: new Map(Object.entries(res.data).map(([k, v]) => [k.replace(/^coingecko:/, ''), v.mcap])),
    raw: res.raw,
  };
}
