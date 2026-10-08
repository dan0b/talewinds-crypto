import { z } from 'zod';
import { ProviderError } from './errors.ts';
import type { CallContext, Fetched, ProviderClient } from './http.ts';

const RpcError = z.object({ code: z.number(), message: z.string() });

/** JSON-RPC error codes that mean "slow down", not "you did something wrong". */
const RATE_LIMIT_CODES = new Set([429, -32005, -32429]);

/**
 * One JSON-RPC 2.0 call over a ProviderClient. RPC-level rate-limit errors (which arrive with
 * HTTP 200) are retried with the same backoff as HTTP 429s.
 */
export async function rpcCall<S extends z.ZodType>(
  client: ProviderClient,
  method: string,
  params: unknown[],
  result: S,
  ctx: CallContext,
  maxRetries = 3,
): Promise<Fetched<z.infer<S>>> {
  const envelope = z.object({
    jsonrpc: z.literal('2.0'),
    result: result.optional(),
    error: RpcError.optional(),
  });

  for (let attempt = 0; ; attempt++) {
    const res = await client.postJson('', { jsonrpc: '2.0', id: 1, method, params }, envelope, ctx);
    const { error } = res.data;
    if (error) {
      if (RATE_LIMIT_CODES.has(error.code) && attempt < maxRetries) {
        await client.backoff(attempt);
        continue;
      }
      throw new ProviderError(
        client.provider,
        `${method} failed: RPC error ${error.code} ${error.message}`,
      );
    }
    if (!('result' in res.data)) {
      throw new ProviderError(client.provider, `${method} returned neither result nor error`);
    }
    return { data: res.data.result as z.infer<S>, raw: res.raw };
  }
}
