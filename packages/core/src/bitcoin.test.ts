import { describe, expect, it } from 'vitest';
import { isValidAddress, normalizeAddress } from './addresses.ts';
import { nativeAssetRef } from './assets.ts';
import { base58Decode, bitcoinAddressType, sha256 } from './bitcoin.ts';
import { CHAINS } from './chains.ts';
import { underlyingOf } from './underlyings.ts';
import { chainsOfFamily, detectChainFamily } from './wallets.ts';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
const text = (s: string) => new TextEncoder().encode(s);

// Vectors from FIPS 180-2 and BIP173/BIP350, each re-checked with Python's hashlib and the BIP
// reference bech32 code on 2026-10-08.
describe('sha256', () => {
  it('matches the standard test vectors, across block boundaries', () => {
    expect(hex(sha256(text('')))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(hex(sha256(text('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hex(sha256(text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
    expect(hex(sha256(text('a'.repeat(1000))))).toBe(
      '41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3',
    );
  });
});

describe('Bitcoin addresses', () => {
  it('recognizes every standard mainnet address type', () => {
    expect(bitcoinAddressType('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('p2pkh'); // genesis
    expect(bitcoinAddressType('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe('p2sh');
    expect(bitcoinAddressType('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe('p2wpkh');
    expect(
      bitcoinAddressType('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3'),
    ).toBe('p2wsh');
    expect(
      bitcoinAddressType('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'),
    ).toBe('p2tr');
    // Upper case is valid bech32 (QR codes use it); mixed case isn't.
    expect(bitcoinAddressType('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4')).toBe('p2wpkh');
  });

  it('rejects typos, testnet, mixed case, and v1 addresses with the old checksum', () => {
    expect(bitcoinAddressType('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb')).toBeNull(); // last char off
    expect(bitcoinAddressType('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5')).toBeNull();
    expect(bitcoinAddressType('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')).toBeNull();
    expect(bitcoinAddressType('bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBeNull();
    expect(
      bitcoinAddressType(
        'bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7k7grplx',
      ),
    ).toBeNull(); // BIP350: witness v1 must use bech32m
    expect(bitcoinAddressType('0x0bd7d308f8e1639fab988df18a8011f41eacad73')).toBeNull();
  });

  it('never mistakes a Bitcoin base58 address for Solana, or the reverse', () => {
    expect(base58Decode('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')?.length).toBe(25);
    expect(detectChainFamily('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('bitcoin');
    expect(detectChainFamily('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe('bitcoin');
    expect(isValidAddress('solana', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(false);
    // Solana addresses, including ones made of '1's (the System Program), stay Solana.
    expect(detectChainFamily('5TYZChz7APFopR5QirD5of4rQj1p9AXxeSAg6JndBdGj')).toBe('solana');
    expect(detectChainFamily('11111111111111111111111111111111')).toBe('solana');
    expect(
      detectChainFamily('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'),
    ).toBe('bitcoin');
  });

  it('stores bech32 lowercase and keeps base58 as given', () => {
    expect(normalizeAddress('bitcoin', 'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4')).toBe(
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    );
    expect(normalizeAddress('bitcoin', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
    );
    expect(() => normalizeAddress('bitcoin', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb')).toThrow(
      'Invalid bitcoin address',
    );
  });

  it('makes BTC a chain of its own family, counted as the btc coin', () => {
    expect(chainsOfFamily('bitcoin')).toEqual(['bitcoin']);
    expect(nativeAssetRef(CHAINS.bitcoin)).toBe('bip122:000000000019d6689c085ae165831e93/slip44:0');
    expect(underlyingOf(nativeAssetRef(CHAINS.bitcoin))).toEqual({
      underlying: 'btc',
      form: 'native',
    });
  });
});
