import { z } from 'zod';

/**
 * Chain identity uses CAIP-2 (`<namespace>:<reference>`), so every chain —
 * EVM, Solana, or anything added later — shares one ID format.
 * https://chainagnostic.org/CAIPs/caip-2
 */
export const ChainId = z
  .string()
  .regex(/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/, 'Expected a CAIP-2 chain ID like eip155:1')
  .brand<'ChainId'>();
export type ChainId = z.infer<typeof ChainId>;

/** Chains group into families that share an address format and adapter. */
export const CHAIN_FAMILIES = ['evm', 'solana', 'bitcoin'] as const;
export const ChainFamily = z.enum(CHAIN_FAMILIES);
export type ChainFamily = z.infer<typeof ChainFamily>;

export interface ChainInfo {
  /** Short handle used in the CLI and config, e.g. `robinhood`. */
  key: string;
  id: ChainId;
  family: ChainFamily;
  name: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** SLIP-44 coin type of the native asset, used in its CAIP-19 ID (ETH = 60, SOL = 501). */
  nativeSlip44: number;
}

const chain = (info: Omit<ChainInfo, 'id'> & { id: string }): ChainInfo => ({
  ...info,
  id: ChainId.parse(info.id),
});

/** Chains the platform supports. Add a chain here, then give it an adapter. */
export const CHAINS = {
  ethereum: chain({
    key: 'ethereum',
    id: 'eip155:1',
    family: 'evm',
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    nativeSlip44: 60,
  }),
  robinhood: chain({
    key: 'robinhood',
    id: 'eip155:4663',
    family: 'evm',
    name: 'Robinhood Chain',
    nativeSymbol: 'ETH',
    nativeDecimals: 18,
    // The native gas asset is ETH, so it shares ETH's coin type.
    nativeSlip44: 60,
  }),
  solana: chain({
    key: 'solana',
    // CAIP-2 for Solana uses the first 32 characters of the genesis hash.
    id: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    family: 'solana',
    name: 'Solana',
    nativeSymbol: 'SOL',
    nativeDecimals: 9,
    nativeSlip44: 501,
  }),
  bitcoin: chain({
    key: 'bitcoin',
    // CAIP-2 for Bitcoin uses the first 32 hex characters of the genesis block hash (BIP122).
    id: 'bip122:000000000019d6689c085ae165831e93',
    family: 'bitcoin',
    name: 'Bitcoin',
    nativeSymbol: 'BTC',
    nativeDecimals: 8,
    nativeSlip44: 0,
  }),
} as const satisfies Record<string, ChainInfo>;

export type ChainKey = keyof typeof CHAINS;

export const CHAIN_KEYS = Object.keys(CHAINS) as [ChainKey, ...ChainKey[]];

export function getChain(key: ChainKey): ChainInfo {
  return CHAINS[key];
}

export function isChainKey(value: string): value is ChainKey {
  return Object.hasOwn(CHAINS, value);
}

export function findChainById(id: string): ChainInfo | undefined {
  return Object.values(CHAINS).find((c) => c.id === id);
}
