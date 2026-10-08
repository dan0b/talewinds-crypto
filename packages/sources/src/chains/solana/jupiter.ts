import { z } from 'zod';
import type { Fetched, ProviderClient } from '../../shared/http.ts';
import type { RequestMeter } from '../../shared/meter.ts';

const Usd = z.number().nonnegative().nullable().optional();

const JupiterToken = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  decimals: z.number().nullable().optional(),
  isVerified: z.boolean().nullable().optional(),
  tokenProgram: z.string().nullable().optional(),
  // Market data (Jupiter aggregates on-chain pools, so this is the executable market).
  usdPrice: Usd,
  mcap: Usd,
  fdv: Usd,
  liquidity: Usd,
  updatedAt: z.string().nullable().optional(),
});

const SearchResult = z.array(JupiterToken);

export type JupiterTokenInfo = z.infer<typeof JupiterToken>;

/** Mints per search request. */
export const JUPITER_BATCH = 50;

/**
 * Token metadata (name, symbol, verification) for up to JUPITER_BATCH mints, from Jupiter's
 * Tokens API v2. Unknown mints are simply absent from the result.
 */
export async function jupiterTokenInfo(
  client: ProviderClient,
  mints: string[],
  meter: RequestMeter,
): Promise<Fetched<Map<string, JupiterTokenInfo>>> {
  const query = mints.join(',');
  const res = await client.getJson(
    `/tokens/v2/search?query=${encodeURIComponent(query)}`,
    SearchResult,
    {
      meter,
      requestKey: `GET /tokens/v2/search?query=${query}`,
    },
  );
  const wanted = new Set(mints);
  return {
    data: new Map(res.data.filter((t) => wanted.has(t.id)).map((t) => [t.id, t])),
    raw: res.raw,
  };
}
