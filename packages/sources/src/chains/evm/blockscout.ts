import { z } from 'zod';
import type { Fetched, ProviderClient } from '../../shared/http.ts';
import type { RequestMeter } from '../../shared/meter.ts';

const Amount = z.union([z.string(), z.number()]).nullable();

const TokenBalance = z.object({
  token: z.object({
    address_hash: z.string().optional(),
    address: z.string().optional(),
    decimals: z.union([z.string(), z.number()]).nullable().optional(),
    symbol: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    type: z.string(),
  }),
  value: Amount,
});

const TokenBalances = z.array(TokenBalance);

export interface DiscoveredToken {
  contract: string;
  rawAmount: bigint;
  /** As reported by the provider; null when it doesn't know. */
  decimals: number | null;
  symbol: unknown;
  name: unknown;
}

export function parseDecimals(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255 ? n : null;
}

export function parseAmount(value: unknown): bigint | null {
  const s = typeof value === 'number' ? String(value) : value;
  return typeof s === 'string' && /^\d+$/.test(s) ? BigInt(s) : null;
}

/**
 * Every ERC-20 an address holds, from a Blockscout instance's API v2 (one response, all
 * tokens). NFTs and other token standards are excluded; zero balances are dropped.
 */
export async function blockscoutTokenBalances(
  client: ProviderClient,
  address: string,
  meter: RequestMeter,
): Promise<Fetched<DiscoveredToken[]>> {
  const res = await client.getJson(`/api/v2/addresses/${address}/token-balances`, TokenBalances, {
    meter,
    requestKey: `GET /api/v2/addresses/${address}/token-balances`,
  });

  const tokens: DiscoveredToken[] = [];
  for (const entry of res.data) {
    if (entry.token.type !== 'ERC-20') continue;
    const contract = entry.token.address_hash ?? entry.token.address;
    const rawAmount = parseAmount(entry.value);
    if (!contract || rawAmount === null || rawAmount === 0n) continue;
    tokens.push({
      contract,
      rawAmount,
      decimals: parseDecimals(entry.token.decimals),
      symbol: entry.token.symbol,
      name: entry.token.name,
    });
  }
  return { data: tokens, raw: res.raw };
}
