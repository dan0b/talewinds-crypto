import { describe, expect, it } from 'vitest';
import { AssetRef, nativeAssetRef, venueAssetRef } from './assets.ts';
import { CHAINS } from './chains.ts';
import { CoinKey, TOKEN_UNDERLYINGS, underlyingOf } from './underlyings.ts';

describe('underlying grouping (ADR 0019)', () => {
  it('maps native gas assets by coin type, on every chain', () => {
    expect(underlyingOf(nativeAssetRef(CHAINS.ethereum))).toEqual({
      underlying: 'eth',
      form: 'native',
    });
    expect(underlyingOf(nativeAssetRef(CHAINS.robinhood))).toEqual({
      underlying: 'eth',
      form: 'native',
    });
    expect(underlyingOf(nativeAssetRef(CHAINS.solana))).toEqual({
      underlying: 'sol',
      form: 'native',
    });
  });

  it('maps wrapped and staked versions to their coin, keeping the form', () => {
    const weth = `${CHAINS.ethereum.id}/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`;
    const rseth = `${CHAINS.ethereum.id}/erc20:0xa1290d69c65a6fe4df752f95823fae25cb99e5a7`;
    expect(underlyingOf(weth)).toEqual({ underlying: 'eth', form: 'wrapped' });
    expect(underlyingOf(rseth)).toEqual({ underlying: 'eth', form: 'restaked' });
  });

  it('maps venue codes as the venue defines them, and leaves the unknown alone', () => {
    expect(underlyingOf(venueAssetRef('coinbase', 'ETH'))).toEqual({
      underlying: 'eth',
      form: 'venue',
    });
    expect(underlyingOf(venueAssetRef('coinbase', 'USD'))).toEqual({
      underlying: 'usd',
      form: 'venue',
    });
    expect(underlyingOf(venueAssetRef('coinbase', 'DOGE'))).toBeNull();
    // A token merely *named* like a coin is never matched by ticker.
    expect(
      underlyingOf(`${CHAINS.ethereum.id}/erc20:0x000000000000000000000000000000000000beef`),
    ).toBeNull();
  });

  it('has only valid, normalized asset IDs in the registry', () => {
    for (const ref of Object.keys(TOKEN_UNDERLYINGS)) {
      expect(AssetRef.safeParse(ref).success).toBe(true);
      if (ref.includes('/erc20:')) expect(ref).toBe(ref.toLowerCase());
    }
  });

  it('accepts registry IDs and asset IDs as coin keys, nothing else', () => {
    expect(CoinKey.safeParse('eth').success).toBe(true);
    expect(
      CoinKey.safeParse('eip155:4663/erc20:0x18e674231a58c239dc7daedcffe15ec3a24cff5c').success,
    ).toBe(true);
    expect(CoinKey.safeParse('HOOKR').success).toBe(false); // tickers aren't identities
    expect(CoinKey.safeParse('').success).toBe(false);
  });
});
