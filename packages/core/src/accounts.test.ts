import { describe, expect, it } from 'vitest';
import { NewAccountInput, normalizeAccount } from './accounts.ts';
import { ChainId } from './chains.ts';

const EVM = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

describe('normalizeAccount', () => {
  it('builds a CAIP-10 ref and lowercases EVM addresses', () => {
    const account = normalizeAccount(
      NewAccountInput.parse({
        kind: 'wallet',
        chain: 'robinhood',
        address: EVM,
        ownership: 'owned',
      }),
    );
    expect(account.ref).toBe(`eip155:4663:${EVM.toLowerCase()}`);
    expect(account.chainId).toBe('eip155:4663');
  });

  it('keeps Solana addresses case-sensitive', () => {
    const account = normalizeAccount({
      kind: 'wallet',
      chain: 'solana',
      address: SOL,
      ownership: 'tracked',
    });
    expect(account.ref).toBe(`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${SOL}`);
  });

  it('rejects an address from the wrong chain family', () => {
    expect(() =>
      normalizeAccount({ kind: 'wallet', chain: 'solana', address: EVM, ownership: 'owned' }),
    ).toThrow(/Invalid solana address/);
  });

  it('keys Hyperliquid venue accounts by address and Coinbase by label', () => {
    expect(
      normalizeAccount({ kind: 'venue', venue: 'hyperliquid', address: EVM, ownership: 'owned' })
        .ref,
    ).toBe(`venue:hyperliquid:${EVM.toLowerCase()}`);
    expect(normalizeAccount({ kind: 'venue', venue: 'coinbase', ownership: 'owned' }).ref).toBe(
      'venue:coinbase:main',
    );
  });

  it('requires an address for Hyperliquid', () => {
    expect(() =>
      normalizeAccount({ kind: 'venue', venue: 'hyperliquid', ownership: 'owned' }),
    ).toThrow(/0x address/);
  });
});

describe('ChainId', () => {
  it('accepts CAIP-2 and rejects bare numbers', () => {
    expect(ChainId.safeParse('eip155:4663').success).toBe(true);
    expect(ChainId.safeParse('4663').success).toBe(false);
  });
});
