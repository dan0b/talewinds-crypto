import { z } from 'zod';
import { Ownership } from './accounts.ts';
import { isValidAddress, normalizeAddress } from './addresses.ts';
import { CHAIN_KEYS, CHAINS, type ChainFamily, type ChainKey } from './chains.ts';

/**
 * A wallet is an address you (or someone you track) controls, spanning every chain of its family
 * (ADR 0016). One EVM address is one wallet on every EVM chain; its per-chain accounts hang off it.
 */

/** Which chain family an address belongs to, from its format alone. */
export function detectChainFamily(address: string): ChainFamily | null {
  const a = address.trim();
  if (isValidAddress('evm', a)) return 'evm';
  if (isValidAddress('solana', a)) return 'solana';
  return null;
}

/** Every supported chain in a family, e.g. evm → [ethereum, robinhood]. */
export function chainsOfFamily(family: ChainFamily): ChainKey[] {
  return CHAIN_KEYS.filter((key) => CHAINS[key].family === family);
}

export const MAX_WALLET_NAME_LENGTH = 64;

/** Input for adding a wallet, from the dashboard, API, or CLI. */
export const NewWalletInput = z.object({
  address: z.string().trim().min(1),
  name: z.string().trim().max(MAX_WALLET_NAME_LENGTH).nullish(),
  /** Chains to track it on. Defaults to every supported chain of the address's family. */
  chains: z.array(z.enum(CHAIN_KEYS)).min(1).optional(),
  ownership: Ownership.default('owned'),
});
export type NewWalletInput = z.input<typeof NewWalletInput>;

export interface NormalizedWallet {
  family: ChainFamily;
  address: string;
  name: string | null;
  chains: ChainKey[];
  ownership: Ownership;
}

export function normalizeWallet(input: NewWalletInput): NormalizedWallet {
  const parsed = NewWalletInput.parse(input);
  const family = detectChainFamily(parsed.address);
  if (!family) {
    throw new Error(
      'Not a recognized wallet address (expected an EVM 0x… address or a Solana address)',
    );
  }
  const chains = parsed.chains ?? chainsOfFamily(family);
  for (const key of chains) {
    if (CHAINS[key].family !== family) {
      throw new Error(`${CHAINS[key].name} isn't a ${family === 'evm' ? 'EVM' : 'Solana'} chain`);
    }
  }
  return {
    family,
    address: normalizeAddress(family, parsed.address),
    name: parsed.name?.trim() || null,
    chains: [...new Set(chains)],
    ownership: parsed.ownership,
  };
}

/** Rename input: a trimmed name, or null to clear it. */
export const WalletName = z.string().trim().max(MAX_WALLET_NAME_LENGTH).nullable();
