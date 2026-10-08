import {
  type AssetRef,
  CHAINS,
  MAX_NAME_LENGTH,
  MAX_SYMBOL_LENGTH,
  type Note,
  nativeAssetRef,
  normalizeAddress,
  rawAmount,
  sanitizeTokenText,
  tokenAssetRef,
} from '@talewinds/core';
import { ProviderError } from '../../shared/errors.ts';
import type { ProviderClient } from '../../shared/http.ts';
import type {
  BalanceContext,
  BalanceReading,
  ObservedAsset,
  ObservedBalance,
  RawCapture,
  WalletBalanceSource,
} from '../../types.ts';
import { alchemyTokenBalances, alchemyTokenMetadata } from './alchemy.ts';
import { blockscoutTokenBalances } from './blockscout.ts';
import { getNativeBalance, readDecimals } from './rpc.ts';

export type EvmChainKey = 'ethereum' | 'robinhood';

export interface EvmClients {
  rpc: ProviderClient;
  /** Token discovery backend. Missing ⇒ native balance only, and the reading is partial. */
  discovery:
    | { kind: 'blockscout'; client: ProviderClient }
    | { kind: 'alchemy'; client: ProviderClient }
    | { kind: 'unavailable'; reason: string };
}

/** Most token metadata lookups per sync; the rest are read on following syncs. */
const MAX_METADATA_LOOKUPS = 150;

export function createEvmBalanceSource(
  chainKey: EvmChainKey,
  clients: EvmClients,
): WalletBalanceSource {
  const chain = CHAINS[chainKey];

  return {
    chainKey,
    async fetchBalances(
      address: string,
      { meter, known }: BalanceContext,
    ): Promise<BalanceReading> {
      const owner = normalizeAddress('evm', address);
      const captures: RawCapture[] = [];
      const balances: ObservedBalance[] = [];
      const notes: Note[] = [];
      let complete = true;
      const keep = (raw: RawCapture) => captures.push(raw) - 1;

      // Native balance, always from RPC.
      const native = await getNativeBalance(clients.rpc, owner, meter);
      const nativeIndex = keep(native.raw);
      if (native.data > 0n) {
        balances.push({
          asset: {
            ref: nativeAssetRef(chain),
            chainId: chain.id,
            kind: 'native',
            address: null,
            symbol: chain.nativeSymbol,
            name: chain.nativeSymbol === 'ETH' ? 'Ether' : chain.name,
            decimals: chain.nativeDecimals,
            decimalsSource: 'chain',
            metadataSource: 'registry',
            providerVerified: true,
          },
          rawAmount: rawAmount(native.data),
          captureIndex: nativeIndex,
        });
      }

      const discovery = clients.discovery;
      if (discovery.kind === 'unavailable') {
        return {
          captures,
          balances,
          notes: [{ code: 'token_discovery_unavailable', message: discovery.reason }],
          complete: false,
        };
      }

      /** Decimals: provider-reported, else already known, else read from the contract. */
      const resolveDecimals = async (
        ref: AssetRef,
        contract: string,
        reported: number | null,
        reportedBy: string,
      ): Promise<{ decimals: number; source: string } | null> => {
        if (reported !== null) return { decimals: reported, source: reportedBy };
        const k = known(ref);
        if (k) return { decimals: k.decimals, source: 'known' };
        const read = await readDecimals(clients.rpc, contract, meter);
        if (read) keep(read.raw);
        return read?.data != null ? { decimals: read.data, source: 'rpc' } : null;
      };

      let skippedNoDecimals = 0;
      const toAsset = (
        ref: AssetRef,
        contract: string,
        decimals: { decimals: number; source: string },
        meta: { symbol: unknown; name: unknown; source: string | null },
      ): ObservedAsset => ({
        ref,
        chainId: chain.id,
        kind: 'token',
        address: normalizeAddress('evm', contract),
        symbol: sanitizeTokenText(meta.symbol, MAX_SYMBOL_LENGTH),
        name: sanitizeTokenText(meta.name, MAX_NAME_LENGTH),
        decimals: decimals.decimals,
        decimalsSource: decimals.source,
        metadataSource: meta.source,
        providerVerified: false,
      });

      // A discovery failure (e.g. a network not enabled for an API key) shouldn't hide the native
      // balance: the reading becomes partial, with the provider's explanation as a note.
      try {
        if (discovery.kind === 'blockscout') {
          const res = await blockscoutTokenBalances(discovery.client, owner, meter);
          const index = keep(res.raw);
          for (const t of res.data) {
            const ref = tokenAssetRef(chain, t.contract);
            const decimals = await resolveDecimals(ref, t.contract, t.decimals, 'blockscout');
            if (!decimals) {
              skippedNoDecimals++;
              continue;
            }
            balances.push({
              asset: toAsset(ref, t.contract, decimals, {
                symbol: t.symbol,
                name: t.name,
                source: 'blockscout',
              }),
              rawAmount: rawAmount(t.rawAmount),
              captureIndex: index,
            });
          }
        }

        if (discovery.kind === 'alchemy') {
          const { pages, truncated } = await alchemyTokenBalances(discovery.client, owner, meter);
          if (truncated) {
            complete = false;
            notes.push({
              code: 'token_list_truncated',
              message: 'This wallet holds more tokens than one sync reads; some were not listed.',
            });
          }
          let lookups = 0;
          let deferred = 0;
          for (const page of pages) {
            const index = keep(page.raw);
            for (const t of page.data) {
              const ref = tokenAssetRef(chain, t.contract);
              let decimals: { decimals: number; source: string } | null;
              let meta: { symbol: unknown; name: unknown; source: string | null } = {
                symbol: null,
                name: null,
                source: null,
              };
              const k = known(ref);
              if (k) {
                decimals = { decimals: k.decimals, source: 'known' };
              } else if (lookups >= MAX_METADATA_LOOKUPS) {
                deferred++;
                continue;
              } else {
                lookups++;
                const md = await alchemyTokenMetadata(discovery.client, t.contract, meter);
                keep(md.raw);
                meta = { symbol: md.data.symbol, name: md.data.name, source: 'alchemy' };
                decimals = await resolveDecimals(ref, t.contract, md.data.decimals, 'alchemy');
              }
              if (!decimals) {
                skippedNoDecimals++;
                continue;
              }
              balances.push({
                asset: toAsset(ref, t.contract, decimals, meta),
                rawAmount: rawAmount(t.rawAmount),
                captureIndex: index,
              });
            }
          }
          if (deferred > 0) {
            complete = false;
            notes.push({
              code: 'metadata_deferred',
              message: `${deferred} new tokens will be read on the next sync (metadata lookups are capped per sync).`,
            });
          }
        }
      } catch (err) {
        if (!(err instanceof ProviderError)) throw err;
        complete = false;
        notes.push({
          code: 'token_discovery_failed',
          message: `Token balances couldn't be read (${err.message}). Only the native balance is shown.`,
        });
      }

      if (skippedNoDecimals > 0) {
        notes.push({
          code: 'no_decimals',
          message: `${skippedNoDecimals} tokens skipped: their contracts don't report decimals, so amounts can't be read.`,
        });
      }

      return { captures, balances, notes, complete };
    },
  };
}
