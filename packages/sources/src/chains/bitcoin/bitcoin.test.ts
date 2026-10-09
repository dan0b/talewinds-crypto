import { formatRawAmount } from '@talewinds/core';
import { describe, expect, it } from 'vitest';
import { createSources } from '../../index.ts';
import { RequestMeter } from '../../shared/meter.ts';
import { fakeFetch, fixture, noSleep, type Route } from '../../testing/fake-fetch.ts';

/** Public, well-known addresses (fixtures recorded 2026-10-08; Esplora responses are the same on
 * Blockstream, the primary, and mempool.space, the fallback). */
const GENESIS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const TAPROOT = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'; // BIP350 example

const at =
  (host: string, reply: unknown): Route =>
  (req) =>
    req.url.startsWith(`https://${host}/api/address/`) ? reply : undefined;

const read = (fetch: ReturnType<typeof fakeFetch>, address: string) =>
  createSources({}, { fetch, sleep: noSleep }).wallets.bitcoin.fetchBalances(address, {
    meter: new RequestMeter(),
    known: () => undefined,
  });

describe('Bitcoin balances (Esplora)', () => {
  it('counts confirmed coins only, and notes what is still unconfirmed', async () => {
    const r = await read(
      fakeFetch([at('blockstream.info', fixture('esplora-address-genesis.json'))]),
      GENESIS,
    );
    expect(r.balances).toHaveLength(1);
    const btc = r.balances[0];
    if (!btc) throw new Error('expected a BTC balance');
    expect(btc.asset).toMatchObject({
      ref: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
      kind: 'native',
      symbol: 'BTC',
      decimals: 8,
      providerVerified: true,
    });
    // 5,758,276,965 sats funded minus spent, confirmed; the +4,218 sats in the mempool aren't counted.
    expect(formatRawAmount(btc.rawAmount, 8)).toBe('57.58276965');
    expect(r.notes).toEqual([
      {
        code: 'unconfirmed',
        message: "+0.00004218 BTC is unconfirmed (incoming); it isn't counted until it confirms.",
      },
    ]);
    expect(r.complete).toBe(true);
    expect(r.captures[0]?.requestKey).toBe(`address(${GENESIS})`);
  });

  it("says a Taproot address's inscriptions and runes aren't read", async () => {
    const r = await read(
      fakeFetch([at('blockstream.info', fixture('esplora-address-taproot.json'))]),
      TAPROOT,
    );
    expect(r.balances).toEqual([]); // nothing confirmed, so nothing stored
    expect(r.notes.map((n) => n.code)).toEqual(['taproot_assets_not_read']);
  });

  it('falls back to mempool.space when Blockstream is down, quickly, and says so', async () => {
    const fetch = fakeFetch([
      at('blockstream.info', new Response('unavailable', { status: 503 })),
      at('mempool.space', fixture('esplora-address-genesis.json')),
    ]);
    const r = await read(fetch, GENESIS);
    expect(r.balances).toHaveLength(1);
    expect(r.notes.find((n) => n.code === 'fallback_provider')?.message).toBe(
      'esplora:blockstream.info was unavailable; read from esplora:mempool.space instead.',
    );
    // One retry on the primary (two attempts), then the fallback.
    expect(fetch.calls.filter((c) => c.url.includes('blockstream.info'))).toHaveLength(2);
  });

  it("doesn't fall back for a rejected address (it would be rejected there too)", async () => {
    const fetch = fakeFetch([
      at('blockstream.info', new Response('Invalid Bitcoin address', { status: 400 })),
      at('mempool.space', fixture('esplora-address-genesis.json')),
    ]);
    await expect(read(fetch, GENESIS)).rejects.toThrow('HTTP 400');
    expect(fetch.calls.some((c) => c.url.includes('mempool.space'))).toBe(false);
  });
});
