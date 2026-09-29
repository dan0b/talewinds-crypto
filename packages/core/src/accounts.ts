import { z } from 'zod';
import { normalizeAddress } from './addresses.ts';
import { CHAIN_KEYS, CHAINS, type ChainId } from './chains.ts';
import { Venue } from './venues.ts';

/**
 * Whose account is this? Decides which calculations run on its data:
 *  - owned:    yours. Feeds portfolio, cost basis, P&L, reconciliation.
 *  - tracked:  someone else's you chose to follow (KOL, smart money, insider).
 *              Gets behavior analytics, not accounting.
 *  - observed: seen during analysis, never deliberately followed. Stored lightly.
 */
export const OWNERSHIPS = ['owned', 'tracked', 'observed'] as const;
export const Ownership = z.enum(OWNERSHIPS);
export type Ownership = z.infer<typeof Ownership>;

/** A wallet lives on a chain; a venue account lives at an exchange/app. */
export const ACCOUNT_KINDS = ['wallet', 'venue'] as const;
export const AccountKind = z.enum(ACCOUNT_KINDS);
export type AccountKind = z.infer<typeof AccountKind>;

/** A person or group controlling one or more accounts. */
export const ENTITY_KINDS = [
  'self',
  'person',
  'kol',
  'cluster',
  'organization',
  'unknown',
] as const;
export const EntityKind = z.enum(ENTITY_KINDS);
export type EntityKind = z.infer<typeof EntityKind>;

/** Input for registering an account, from the CLI, API, or a pipeline. */
export const NewAccountInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('wallet'),
    chain: z.enum(CHAIN_KEYS),
    address: z.string().min(1),
    ownership: Ownership,
    label: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('venue'),
    venue: Venue,
    /** Hyperliquid: the account's 0x address. Coinbase: omit. */
    address: z.string().min(1).optional(),
    ownership: Ownership,
    label: z.string().min(1).optional(),
  }),
]);
export type NewAccountInput = z.infer<typeof NewAccountInput>;

/** A validated, normalized account ready to store. */
export interface NormalizedAccount {
  ref: string;
  kind: AccountKind;
  ownership: Ownership;
  chainId: ChainId | null;
  address: string | null;
  venue: Venue | null;
  label: string | null;
}

/**
 * Every account has one canonical `ref`, unique across the platform:
 *  - wallet: CAIP-10, e.g. `eip155:1:0xabc…` or `solana:5eyk…:7xKX…`
 *  - venue:  `venue:<venue>:<address or label>`, e.g. `venue:coinbase:main`
 * The same EVM address on two chains is two accounts (per CAIP-10); link them
 * through a shared Entity.
 */
export function normalizeAccount(input: NewAccountInput): NormalizedAccount {
  if (input.kind === 'wallet') {
    const chain = CHAINS[input.chain];
    const address = normalizeAddress(chain.family, input.address);
    return {
      ref: `${chain.id}:${address}`,
      kind: 'wallet',
      ownership: input.ownership,
      chainId: chain.id,
      address,
      venue: null,
      label: input.label ?? null,
    };
  }

  if (input.venue === 'hyperliquid') {
    if (!input.address) throw new Error('Hyperliquid accounts need their 0x address');
    const address = normalizeAddress('evm', input.address);
    return {
      ref: `venue:hyperliquid:${address}`,
      kind: 'venue',
      ownership: input.ownership,
      chainId: null,
      address,
      venue: 'hyperliquid',
      label: input.label ?? null,
    };
  }

  const label = input.label ?? 'main';
  return {
    ref: `venue:${input.venue}:${label.toLowerCase()}`,
    kind: 'venue',
    ownership: input.ownership,
    chainId: null,
    address: null,
    venue: input.venue,
    label,
  };
}
