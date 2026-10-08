import type { ChainKey } from '@talewinds/core';

/** How each chain is read, and how its assets are identified at price providers. */
export interface ChainProviderConfig {
  publicRpcUrl: string;
  /** Alchemy network slug, if Alchemy serves this chain. */
  alchemyNetwork?: string;
  /** Where the list of held tokens comes from. */
  tokenDiscovery: 'blockscout' | 'alchemy' | 'solana-rpc';
  blockscoutUrl?: string;
  /** Minimum spacing between RPC requests on the public endpoint. */
  publicRpcIntervalMs: number;
  /** Chain prefix in DefiLlama coin IDs (`<chain>:<address>`). */
  defillamaChain: string;
  dexscreenerChain: string;
  /** CoinGecko ID of the native asset, priced via DefiLlama as `coingecko:<id>`. */
  nativeCoingeckoId: string;
}

/**
 * Tested live 2026-09-28 (docs/briefs/01-wallet-balances.md). Robinhood Chain's official
 * explorer (Blockscout) blocks programmatic access, so its token discovery needs Alchemy.
 */
export const CHAIN_PROVIDERS: Record<ChainKey, ChainProviderConfig> = {
  ethereum: {
    publicRpcUrl: 'https://ethereum-rpc.publicnode.com',
    alchemyNetwork: 'eth-mainnet',
    tokenDiscovery: 'blockscout',
    blockscoutUrl: 'https://eth.blockscout.com',
    publicRpcIntervalMs: 200,
    defillamaChain: 'ethereum',
    dexscreenerChain: 'ethereum',
    nativeCoingeckoId: 'ethereum',
  },
  robinhood: {
    publicRpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
    alchemyNetwork: 'robinhood-mainnet',
    tokenDiscovery: 'alchemy',
    publicRpcIntervalMs: 500,
    defillamaChain: 'robinhood',
    dexscreenerChain: 'robinhood',
    nativeCoingeckoId: 'ethereum',
  },
  solana: {
    publicRpcUrl: 'https://api.mainnet-beta.solana.com',
    tokenDiscovery: 'solana-rpc',
    // The public endpoint allows ~10 calls per method per window; stay well under it.
    publicRpcIntervalMs: 1100,
    defillamaChain: 'solana',
    dexscreenerChain: 'solana',
    nativeCoingeckoId: 'solana',
  },
};

export const alchemyUrl = (network: string, apiKey: string) =>
  `https://${network}.g.alchemy.com/v2/${apiKey}`;
