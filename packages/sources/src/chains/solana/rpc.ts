import { z } from 'zod';
import type { Fetched, ProviderClient } from '../../shared/http.ts';
import { rpcCall } from '../../shared/json-rpc.ts';
import type { RequestMeter } from '../../shared/meter.ts';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// Lamports can exceed 2^53; parseProviderJson keeps such values as exact strings.
const Lamports = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]);

const BalanceResult = z.object({
  context: z.object({ slot: z.number() }),
  value: Lamports,
});

const TokenAccountsResult = z.object({
  context: z.object({ slot: z.number() }),
  value: z.array(
    z.object({
      pubkey: z.string(),
      account: z.object({
        data: z.object({
          program: z.string(),
          parsed: z.object({
            type: z.string(),
            info: z.object({
              mint: z.string(),
              owner: z.string(),
              state: z.string().optional(),
              tokenAmount: z.object({
                amount: z.string().regex(/^\d+$/),
                decimals: z.number().int().min(0).max(255),
              }),
            }),
          }),
        }),
      }),
    }),
  ),
});

export async function getSolBalance(
  client: ProviderClient,
  owner: string,
  meter: RequestMeter,
): Promise<Fetched<bigint>> {
  const res = await rpcCall(
    client,
    'getBalance',
    [owner, { commitment: 'confirmed' }],
    BalanceResult,
    {
      meter,
      requestKey: `getBalance(${owner},confirmed)`,
    },
  );
  return { data: BigInt(res.data.value), raw: res.raw };
}

export interface TokenAccountBalance {
  mint: string;
  rawAmount: bigint;
  decimals: number;
}

/** Every token account the owner has under one token program (parsed by the RPC node). */
export async function getTokenAccounts(
  client: ProviderClient,
  owner: string,
  programId: string,
  meter: RequestMeter,
): Promise<Fetched<TokenAccountBalance[]>> {
  const res = await rpcCall(
    client,
    'getTokenAccountsByOwner',
    [owner, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }],
    TokenAccountsResult,
    { meter, requestKey: `getTokenAccountsByOwner(${owner},${programId},jsonParsed)` },
  );
  return {
    data: res.data.value.map((a) => ({
      mint: a.account.data.parsed.info.mint,
      rawAmount: BigInt(a.account.data.parsed.info.tokenAmount.amount),
      decimals: a.account.data.parsed.info.tokenAmount.decimals,
    })),
    raw: res.raw,
  };
}
