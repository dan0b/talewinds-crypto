import {
  bitcoinAddressType,
  CHAINS,
  formatRawAmount,
  type Note,
  nativeAssetRef,
  rawAmount,
} from '@talewinds/core';
import { z } from 'zod';
import { ProviderError } from '../../shared/errors.ts';
import type { Fetched, ProviderClient } from '../../shared/http.ts';
import type { BalanceContext, BalanceReading, WalletBalanceSource } from '../../types.ts';

/** Esplora address stats: totals in sats, as integers. */
const Stats = z.object({
  funded_txo_sum: z.number().int().nonnegative(),
  spent_txo_sum: z.number().int().nonnegative(),
  tx_count: z.number().int().nonnegative(),
});
const AddressInfo = z.object({ address: z.string(), chain_stats: Stats, mempool_stats: Stats });

const chain = CHAINS.bitcoin;

/**
 * Bitcoin balances by address (step 02a) from an Esplora API: mempool.space, falling back to
 * Blockstream when it's down. Only confirmed coins count; an unconfirmed change is a note. A
 * Taproot address's sats count as BTC, but its inscriptions and runes aren't read (also a note).
 */
export function createBitcoinBalanceSource(clients: {
  primary: ProviderClient;
  fallback?: ProviderClient;
}): WalletBalanceSource {
  return {
    chainKey: 'bitcoin',
    async fetchBalances(address: string, { meter }: BalanceContext): Promise<BalanceReading> {
      const notes: Note[] = [];
      const path = `/api/address/${encodeURIComponent(address)}`;
      const ctx = { meter, requestKey: `address(${address})` };
      let res: Fetched<z.infer<typeof AddressInfo>>;
      try {
        res = await clients.primary.getJson(path, AddressInfo, ctx);
      } catch (err) {
        // Only an outage moves to the fallback; a rejected address would be rejected there too.
        if (!clients.fallback || !(err instanceof ProviderError && err.retryable)) throw err;
        res = await clients.fallback.getJson(path, AddressInfo, ctx);
        notes.push({
          code: 'fallback_provider',
          message: `${clients.primary.provider} was unavailable; read from ${clients.fallback.provider} instead.`,
        });
      }

      const confirmed =
        BigInt(res.data.chain_stats.funded_txo_sum) - BigInt(res.data.chain_stats.spent_txo_sum);
      const pending =
        BigInt(res.data.mempool_stats.funded_txo_sum) -
        BigInt(res.data.mempool_stats.spent_txo_sum);
      if (pending !== 0n) {
        const amount = formatRawAmount(rawAmount(pending < 0n ? -pending : pending), 8);
        notes.push({
          code: 'unconfirmed',
          message: `${pending > 0n ? '+' : '−'}${amount} BTC is unconfirmed (${pending > 0n ? 'incoming' : 'outgoing'}); it isn't counted until it confirms.`,
        });
      }
      if (bitcoinAddressType(address) === 'p2tr') {
        notes.push({
          code: 'taproot_assets_not_read',
          message:
            "Ordinals inscriptions, Runes, and BRC-20 tokens on this address aren't read; their sats count as BTC.",
        });
      }

      return {
        captures: [res.raw],
        balances:
          confirmed > 0n
            ? [
                {
                  asset: {
                    ref: nativeAssetRef(chain),
                    chainId: chain.id,
                    kind: 'native',
                    address: null,
                    symbol: 'BTC',
                    name: 'Bitcoin',
                    decimals: chain.nativeDecimals,
                    decimalsSource: 'chain',
                    metadataSource: 'registry',
                    providerVerified: true,
                  },
                  rawAmount: rawAmount(confirmed),
                  captureIndex: 0,
                },
              ]
            : [],
        notes,
        complete: true,
      };
    },
  };
}
