import {
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
import type { ProviderClient } from '../../shared/http.ts';
import type {
  BalanceContext,
  BalanceReading,
  ObservedBalance,
  RawCapture,
  WalletBalanceSource,
} from '../../types.ts';
import { JUPITER_BATCH, type JupiterTokenInfo, jupiterTokenInfo } from './jupiter.ts';
import { getSolBalance, getTokenAccounts, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from './rpc.ts';

export interface SolanaClients {
  rpc: ProviderClient;
  jupiter: ProviderClient;
}

export function createSolanaBalanceSource(clients: SolanaClients): WalletBalanceSource {
  const chain = CHAINS.solana;

  return {
    chainKey: 'solana',
    async fetchBalances(
      address: string,
      { meter, known }: BalanceContext,
    ): Promise<BalanceReading> {
      const owner = normalizeAddress('solana', address);
      const captures: RawCapture[] = [];
      const balances: ObservedBalance[] = [];
      const notes: Note[] = [];
      const keep = (raw: RawCapture) => captures.push(raw) - 1;

      const sol = await getSolBalance(clients.rpc, owner, meter);
      const solIndex = keep(sol.raw);
      if (sol.data > 0n) {
        balances.push({
          asset: {
            ref: nativeAssetRef(chain),
            chainId: chain.id,
            kind: 'native',
            address: null,
            symbol: 'SOL',
            name: 'Solana',
            decimals: chain.nativeDecimals,
            decimalsSource: 'chain',
            metadataSource: 'registry',
            providerVerified: true,
          },
          rawAmount: rawAmount(sol.data),
          captureIndex: solIndex,
        });
      }

      // An owner can hold several token accounts for one mint; sum them per mint.
      const byMint = new Map<
        string,
        { rawAmount: bigint; decimals: number; captureIndex: number }
      >();
      for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
        const res = await getTokenAccounts(clients.rpc, owner, program, meter);
        const index = keep(res.raw);
        for (const a of res.data) {
          const prev = byMint.get(a.mint);
          byMint.set(a.mint, {
            rawAmount: (prev?.rawAmount ?? 0n) + a.rawAmount,
            decimals: a.decimals,
            captureIndex: prev?.captureIndex ?? index,
          });
        }
      }

      let probableNfts = 0;
      const held = [...byMint.entries()].filter(([, h]) => {
        if (h.rawAmount === 0n) return false;
        // A 0-decimal token with a balance of exactly 1 is almost always an NFT.
        if (h.decimals === 0 && h.rawAmount === 1n) {
          probableNfts++;
          return false;
        }
        return true;
      });

      // Metadata only for mints we haven't seen; known assets keep their stored metadata.
      const info = new Map<string, JupiterTokenInfo>();
      const mints = held.map(([mint]) => mint).filter((mint) => !known(tokenAssetRef(chain, mint)));
      for (let i = 0; i < mints.length; i += JUPITER_BATCH) {
        const res = await jupiterTokenInfo(
          clients.jupiter,
          mints.slice(i, i + JUPITER_BATCH),
          meter,
        );
        keep(res.raw);
        for (const [mint, t] of res.data) info.set(mint, t);
      }

      for (const [mint, h] of held) {
        const t = info.get(mint);
        balances.push({
          asset: {
            ref: tokenAssetRef(chain, mint),
            chainId: chain.id,
            kind: 'token',
            address: mint,
            symbol: sanitizeTokenText(t?.symbol, MAX_SYMBOL_LENGTH),
            name: sanitizeTokenText(t?.name, MAX_NAME_LENGTH),
            // Decimals come from the chain (the RPC node's parsed account), never the metadata API.
            decimals: h.decimals,
            decimalsSource: 'solana-rpc',
            metadataSource: t ? 'jupiter' : null,
            providerVerified: t?.isVerified === true,
          },
          rawAmount: rawAmount(h.rawAmount),
          captureIndex: h.captureIndex,
        });
      }

      if (probableNfts > 0) {
        notes.push({
          code: 'nfts_skipped',
          message: `${probableNfts} probable NFTs skipped (NFTs aren't tracked yet).`,
        });
      }
      return { captures, balances, notes, complete: true };
    },
  };
}
