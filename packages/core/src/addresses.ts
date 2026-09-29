import type { ChainFamily } from './chains.ts';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// Base58 alphabet (no 0, O, I, l); Solana public keys are 32–44 chars.
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidAddress(family: ChainFamily, address: string): boolean {
  switch (family) {
    case 'evm':
      return EVM_ADDRESS.test(address);
    case 'solana':
      return SOLANA_ADDRESS.test(address);
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
  return family === 'evm' ? trimmed.toLowerCase() : trimmed;
}
