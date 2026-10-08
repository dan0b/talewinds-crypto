import { describe, expect, it } from 'vitest';
import { chainsOfFamily, detectChainFamily, normalizeWallet } from './wallets.ts';

const EVM = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

describe('wallets', () => {
  it('detects the chain family from the address format', () => {
    expect(detectChainFamily(EVM)).toBe('evm');
    expect(detectChainFamily(SOL)).toBe('solana');
    expect(detectChainFamily('not an address')).toBeNull();
  });

  it('tracks an EVM wallet on every EVM chain by default', () => {
    expect(chainsOfFamily('evm')).toEqual(['ethereum', 'robinhood']);
    const w = normalizeWallet({ address: EVM, name: '  Trading  ' });
    expect(w).toMatchObject({
      family: 'evm',
      address: EVM.toLowerCase(),
      name: 'Trading',
      chains: ['ethereum', 'robinhood'],
      ownership: 'owned',
    });
  });

  it('accepts a subset of chains, but only of the right family', () => {
    expect(normalizeWallet({ address: EVM, chains: ['robinhood'] }).chains).toEqual(['robinhood']);
    expect(() => normalizeWallet({ address: EVM, chains: ['solana'] })).toThrow(
      /isn't a EVM chain/,
    );
  });

  it('keeps Solana addresses case-sensitive and rejects junk', () => {
    expect(normalizeWallet({ address: SOL }).address).toBe(SOL);
    expect(() => normalizeWallet({ address: 'hello' })).toThrow(/Not a recognized wallet address/);
  });
});
