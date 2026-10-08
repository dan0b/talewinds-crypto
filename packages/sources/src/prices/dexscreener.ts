import type { PriceConfidence } from '@talewinds/core';
import { z } from 'zod';
import { CHAIN_PROVIDERS } from '../config.ts';
import type { Fetched, ProviderClient } from '../shared/http.ts';
import type { RequestMeter } from '../shared/meter.ts';
import type { PricingInput } from '../types.ts';

const Pairs = z.array(
  z.object({
    chainId: z.string(),
    baseToken: z.object({ address: z.string() }),
    priceUsd: z.string().optional(),
    liquidity: z.object({ usd: z.number().optional() }).optional(),
    marketCap: z.number().nullable().optional(),
    fdv: z.number().nullable().optional(),
  }),
);

/** Token addresses per request (DexScreener's limit). */
export const DEXSCREENER_BATCH = 30;

/** Pools shallower than this are too easy to push around to trust their price much. */
export const HIGH_CONFIDENCE_LIQUIDITY_USD = 50_000;

export interface PoolPrice {
  priceUsd: string;
  confidence: PriceConfidence;
  liquidityUsd: number;
  marketCapUsd: number | null;
  fdvUsd: number | null;
}

/**
 * Price, market cap, and liquidity from the deepest pool where the token is the base asset: the
 * primary market source for EVM tokens. Any token with a pool has a DexScreener price, scams
 * included, so these prices never verify an asset on their own.
 */
export async function dexscreenerPrices(
  client: ProviderClient,
  inputs: PricingInput[],
  meter: RequestMeter,
): Promise<Fetched<Map<string, PoolPrice>>> {
  const first = inputs[0];
  if (!first) throw new Error('dexscreenerPrices needs at least one input');
  const chain = CHAIN_PROVIDERS[first.chainKey].dexscreenerChain;
  if (inputs.some((i) => i.chainKey !== first.chainKey || !i.address)) {
    throw new Error('dexscreenerPrices takes tokens from a single chain');
  }

  const addresses = inputs.map((i) => i.address as string);
  const res = await client.getJson(`/tokens/v1/${chain}/${addresses.join(',')}`, Pairs, {
    meter,
    requestKey: `GET /tokens/v1/${chain}/${addresses.join(',')}`,
  });

  const evm = first.chainKey !== 'solana';
  const same = (a: string, b: string) => (evm ? a.toLowerCase() === b.toLowerCase() : a === b);
  const found = new Map<string, PoolPrice>();
  for (const input of inputs) {
    let best: PoolPrice | null = null;
    for (const p of res.data) {
      if (p.chainId !== chain || !same(p.baseToken.address, input.address as string)) continue;
      const liquidityUsd = p.liquidity?.usd ?? 0;
      if (!p.priceUsd || !/^\d+(\.\d+)?$/.test(p.priceUsd)) continue;
      if (!best || liquidityUsd > best.liquidityUsd) {
        best = {
          priceUsd: p.priceUsd,
          confidence: liquidityUsd >= HIGH_CONFIDENCE_LIQUIDITY_USD ? 'high' : 'low',
          liquidityUsd,
          marketCapUsd: p.marketCap ?? null,
          fdvUsd: p.fdv ?? null,
        };
      }
    }
    if (best) found.set(input.ref, best);
  }
  return { data: found, raw: res.raw };
}
