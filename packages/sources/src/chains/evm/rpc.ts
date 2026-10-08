import { z } from 'zod';
import { ProviderError } from '../../shared/errors.ts';
import type { Fetched, ProviderClient } from '../../shared/http.ts';
import { rpcCall } from '../../shared/json-rpc.ts';
import type { RequestMeter } from '../../shared/meter.ts';

const Hex = z.string().regex(/^0x[0-9a-fA-F]*$/, 'expected a hex string');

/** Native balance (wei) at the latest block. */
export async function getNativeBalance(
  client: ProviderClient,
  address: string,
  meter: RequestMeter,
): Promise<Fetched<bigint>> {
  const res = await rpcCall(client, 'eth_getBalance', [address, 'latest'], Hex, {
    meter,
    requestKey: `eth_getBalance(${address},latest)`,
  });
  return { data: BigInt(res.data), raw: res.raw };
}

const DECIMALS_SELECTOR = '0x313ce567'; // decimals()

/**
 * Read an ERC-20's `decimals()` directly from the contract. Returns null (not an error) when the
 * contract doesn't implement it or returns something that can't be decimals.
 */
export async function readDecimals(
  client: ProviderClient,
  contract: string,
  meter: RequestMeter,
): Promise<Fetched<number | null> | null> {
  try {
    const res = await rpcCall(
      client,
      'eth_call',
      [{ to: contract, data: DECIMALS_SELECTOR }, 'latest'],
      Hex,
      { meter, requestKey: `eth_call(${contract},decimals())` },
    );
    if (res.data.length <= 2) return { data: null, raw: res.raw };
    const value = BigInt(res.data);
    return { data: value <= 255n ? Number(value) : null, raw: res.raw };
  } catch (err) {
    // A revert is an RPC error; the contract simply has no usable decimals().
    if (err instanceof ProviderError && !err.retryable) return null;
    throw err;
  }
}
