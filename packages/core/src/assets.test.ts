import { describe, expect, it } from 'vitest';
import {
  AssetRef,
  MAX_SYMBOL_LENGTH,
  nativeAssetRef,
  sanitizeTokenText,
  tokenAssetRef,
} from './assets.ts';
import { CHAINS } from './chains.ts';

describe('asset refs', () => {
  it('builds CAIP-19 native refs from the chain registry', () => {
    expect(nativeAssetRef(CHAINS.ethereum)).toBe('eip155:1/slip44:60');
    expect(nativeAssetRef(CHAINS.robinhood)).toBe('eip155:4663/slip44:60');
    expect(nativeAssetRef(CHAINS.solana)).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
    );
  });

  it('lowercases EVM token addresses and preserves Solana mints', () => {
    expect(tokenAssetRef(CHAINS.robinhood, '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73')).toBe(
      'eip155:4663/erc20:0x0bd7d308f8e1639fab988df18a8011f41eacad73',
    );
    expect(tokenAssetRef(CHAINS.solana, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
  });

  it('rejects malformed refs and wrong-family addresses', () => {
    expect(AssetRef.safeParse('ETH').success).toBe(false);
    expect(() =>
      tokenAssetRef(CHAINS.solana, '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73'),
    ).toThrow();
  });
});

describe('sanitizeTokenText', () => {
  it('caps absurdly long symbols', () => {
    const out = sanitizeTokenText('BTCETHUSDT'.repeat(500), MAX_SYMBOL_LENGTH);
    expect(out).toHaveLength(MAX_SYMBOL_LENGTH);
    expect(out?.endsWith('…')).toBe(true);
  });

  it('strips control and bidi-override characters used for spoofing', () => {
    expect(sanitizeTokenText('US‮DC\u0007', 24)).toBe('USDC');
    expect(sanitizeTokenText('  Wrapped \n\t Ether  ', 64)).toBe('Wrapped Ether');
  });

  it('returns null for empty or non-string input', () => {
    expect(sanitizeTokenText('​ ​', 24)).toBeNull();
    expect(sanitizeTokenText(undefined, 24)).toBeNull();
    expect(sanitizeTokenText(42, 24)).toBeNull();
  });

  it('counts emoji and CJK by code point, not UTF-16 units', () => {
    expect(sanitizeTokenText('币安人生', 24)).toBe('币安人生');
    expect(sanitizeTokenText('🚀'.repeat(30), 24)).toHaveLength(24 * 2 - 1); // 23 rockets (2 units each) + '…'
  });
});
