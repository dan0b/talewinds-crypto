import { z } from 'zod';
import { ChainId, findChainById } from './chains.ts';

/**
 * Venues are off-chain (or app-chain) accounts read through their own APIs
 * rather than a chain adapter. Hyperliquid accounts are keyed by an EVM-style
 * address; Coinbase accounts by a user-chosen label.
 */
export const VENUES = ['coinbase', 'hyperliquid'] as const;
export const Venue = z.enum(VENUES);
export type Venue = z.infer<typeof Venue>;

export interface VenueInfo {
  key: Venue;
  name: string;
  /** Chain-shaped ID scoping the venue's assets (ADR 0018): `venue:coinbase/currency:ETH`. */
  chainId: ChainId;
}

export const VENUE_INFO: Record<Venue, VenueInfo> = {
  coinbase: { key: 'coinbase', name: 'Coinbase', chainId: ChainId.parse('venue:coinbase') },
  hyperliquid: {
    key: 'hyperliquid',
    name: 'Hyperliquid',
    chainId: ChainId.parse('venue:hyperliquid'),
  },
};

export function findVenueByChainId(id: string): VenueInfo | undefined {
  return Object.values(VENUE_INFO).find((v) => v.chainId === id);
}

/** Where an asset lives, for display: a chain's name ("Solana") or a venue's ("Coinbase"). */
export function placeName(chainId: string): string {
  return findChainById(chainId)?.name ?? findVenueByChainId(chainId)?.name ?? chainId;
}
