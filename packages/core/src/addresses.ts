import { base58Decode, bitcoinAddressType } from './bitcoin.ts';
import type { ChainFamily } from './chains.ts';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// Base58 alphabet (no 0, O, I, l); Solana public keys are 32–44 chars.
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidAddress(family: ChainFamily, address: string): boolean {
  switch (family) {
    case 'evm':
      return EVM_ADDRESS.test(address);
    case 'solana':
      // A Solana address is a 32-byte public key. Checking the decoded length also keeps Bitcoin's
      // base58 addresses (25 bytes, same alphabet) from passing as Solana.
      return SOLANA_ADDRESS.test(address) && base58Decode(address)?.length === 32;
    case 'bitcoin':
      return bitcoinAddressType(address) !== null;
  }
}

/**
 * Canonical form used for identity and uniqueness. EVM addresses are
 * case-insensitive, so they are lowercased (display code may checksum them).
 * Solana base58 is case-sensitive and is kept as-is.
 */
export function normalizeAddress(family: ChainFamily, address: string): string {
  const trimmed = address.trim();
  if (!isValidAddress(family, trimmed)) {
    throw new Error(`Invalid ${family} address: ${address}`);
  }
  if (family === 'evm') return trimmed.toLowerCase();
  // Bech32 (bc1…) is case-insensitive and canonically lowercase; base58 is case-sensitive.
  if (family === 'bitcoin' && /^bc1/i.test(trimmed)) return trimmed.toLowerCase();
  return trimmed;
}
