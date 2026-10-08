import { z } from 'zod';
import type { Fetched, ProviderClient } from '../../shared/http.ts';
import { rpcCall } from '../../shared/json-rpc.ts';
import type { RequestMeter } from '../../shared/meter.ts';

// Shapes per Alchemy's Token API reference (alchemy_getTokenBalances / alchemy_getTokenMetadata).
const TokenBalancesResult = z.object({
  address: z.string(),
  tokenBalances: z.array(
    z.object({
      contractAddress: z.string(),
      tokenBalance: z.string().nullable(),
      error: z.unknown().optional(),
    }),
  ),
  pageKey: z.string().nullable().optional(),
});

const TokenMetadataResult = z.object({
  name: z.string().nullable(),
  symbol: z.string().nullable(),
  decimals: z.number().nullable(),
  logo: z.string().nullable().optional(),
});

export interface AlchemyTokenBalance {
  contract: string;
  rawAmount: bigint;
}

/** Most pages to follow in one sync (100 tokens each). */
const MAX_PAGES = 20;

/**
 * Non-zero ERC-20 balances for an address, following pagination. Returns one Fetched per page so
 * each response is kept as its own raw record. `truncated` is true if pages were left unread.
 */
export async function alchemyTokenBalances(
  client: ProviderClient,
  address: string,
  meter: RequestMeter,
): Promise<{ pages: Fetched<AlchemyTokenBalance[]>[]; truncated: boolean }> {
  const pages: Fetched<AlchemyTokenBalance[]>[] = [];
  let pageKey: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const options = pageKey ? { pageKey, maxCount: 100 } : { maxCount: 100 };
    const res = await rpcCall(
      client,
      'alchemy_getTokenBalances',
      [address, 'erc20', options],
      TokenBalancesResult,
      {
        meter,
        requestKey: `alchemy_getTokenBalances(${address},erc20,page=${pageKey ?? 'first'})`,
      },
    );
    const balances: AlchemyTokenBalance[] = [];
    for (const t of res.data.tokenBalances) {
      if (t.error || !t.tokenBalance || !/^0x[0-9a-fA-F]+$/.test(t.tokenBalance)) continue;
      const rawAmount = BigInt(t.tokenBalance);
      if (rawAmount > 0n) balances.push({ contract: t.contractAddress, rawAmount });
    }
    pages.push({ data: balances, raw: res.raw });
    pageKey = res.data.pageKey ?? undefined;
    if (!pageKey) return { pages, truncated: false };
  }
  return { pages, truncated: true };
}

export async function alchemyTokenMetadata(
  client: ProviderClient,
  contract: string,
  meter: RequestMeter,
): Promise<Fetched<z.infer<typeof TokenMetadataResult>>> {
  return rpcCall(client, 'alchemy_getTokenMetadata', [contract], TokenMetadataResult, {
    meter,
    requestKey: `alchemy_getTokenMetadata(${contract})`,
  });
}
