import { z } from 'zod';

/**
 * Venues are off-chain (or app-chain) accounts read through their own APIs
 * rather than a chain adapter. Hyperliquid accounts are keyed by an EVM-style
 * address; Coinbase accounts by a user-chosen label.
 */
export const VENUES = ['coinbase', 'hyperliquid'] as const;
export const Venue = z.enum(VENUES);
export type Venue = z.infer<typeof Venue>;
