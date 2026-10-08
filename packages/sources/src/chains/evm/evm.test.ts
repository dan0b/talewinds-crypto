import { formatRawAmount } from '@talewinds/core';
import { describe, expect, it } from 'vitest';
import { createSources } from '../../index.ts';
import { RequestMeter } from '../../shared/meter.ts';
import { fakeFetch, fixture, get, noSleep, rpc } from '../../testing/fake-fetch.ts';

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const NO_DECIMALS = '0x6B491AE7f8E15B6FBec0D4F084F6C42763e9ea4F'.toLowerCase();
const ctx = () => ({ meter: new RequestMeter(), known: () => undefined });

describe('Ethereum via RPC + Blockscout', () => {
  const fetch = fakeFetch([
    rpc('eth_getBalance', fixture('ethereum-eth_getBalance.json')),
    // decimals() for the token Blockscout reports without decimals
    rpc('eth_call', { jsonrpc: '2.0', id: 1, result: `0x${'0'.repeat(62)}12` }, (p) =>
      JSON.stringify(p).toLowerCase().includes(NO_DECIMALS),
    ),
    get('/token-balances', fixture('blockscout-token-balances.json')),
  ]);
  const sources = createSources({}, { fetch, sleep: noSleep });

  it('reads native + ERC-20 balances, excluding NFTs and zero balances', async () => {
    const r = await sources.wallets.ethereum.fetchBalances(VITALIK, ctx());
    expect(r.complete).toBe(true);
    const native = r.balances.find((b) => b.asset.kind === 'native');
    expect(native?.asset.ref).toBe('eip155:1/slip44:60');
    // 9 ERC-20 entries in the fixture minus the zero balance, plus native ETH
    expect(r.balances.filter((b) => b.asset.kind === 'token')).toHaveLength(8);
    expect(r.balances.some((b) => b.asset.address === `0x${'1'.repeat(40)}`)).toBe(false);
  });

  it('reads decimals from the contract when the indexer lacks them', async () => {
    const r = await sources.wallets.ethereum.fetchBalances(VITALIK, ctx());
    const t = r.balances.find((b) => b.asset.address === NO_DECIMALS);
    expect(t?.asset.decimals).toBe(18);
    expect(t?.asset.decimalsSource).toBe('rpc');
  });

  it('caps attacker-controlled names and never marks tokens verified by itself', async () => {
    const r = await sources.wallets.ethereum.fetchBalances(VITALIK, ctx());
    for (const b of r.balances.filter((x) => x.asset.kind === 'token')) {
      expect((b.asset.name ?? '').length).toBeLessThanOrEqual(64);
      expect(b.asset.providerVerified).toBe(false);
    }
  });

  it('links every balance to a captured response', async () => {
    const r = await sources.wallets.ethereum.fetchBalances(VITALIK, ctx());
    for (const b of r.balances) expect(r.captures[b.captureIndex]).toBeDefined();
    const first = r.balances[0];
    if (!first) throw new Error('expected at least one balance');
    expect(formatRawAmount(first.rawAmount, 18)).toMatch(/^\d+(\.\d+)?$/);
  });
});

describe('Robinhood Chain via Alchemy', () => {
  const WALLET = `0x${'1'.repeat(40)}`;
  const withAlchemy = (extra: Parameters<typeof fakeFetch>[0] = []) =>
    fakeFetch([
      rpc('eth_getBalance', fixture('robinhood-eth_getBalance.json')),
      rpc('alchemy_getTokenBalances', fixture('alchemy-getTokenBalances-page2.json'), (p) =>
        JSON.stringify(p).includes('page-2-key'),
      ),
      rpc('alchemy_getTokenBalances', fixture('alchemy-getTokenBalances-page1.json')),
      rpc('alchemy_getTokenMetadata', fixture('alchemy-getTokenMetadata-weth.json'), (p) =>
        String(p[0]).includes('0bd7d3'),
      ),
      rpc('alchemy_getTokenMetadata', fixture('alchemy-getTokenMetadata-nodecimals.json')),
      // decimals() reverts for the mystery token
      rpc('eth_call', { jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } }),
      ...extra,
    ]);

  it('follows pagination, drops zero/errored balances, and skips tokens without decimals', async () => {
    const sources = createSources(
      { ALCHEMY_API_KEY: 'k' },
      { fetch: withAlchemy(), sleep: noSleep },
    );
    const r = await sources.wallets.robinhood.fetchBalances(WALLET, ctx());
    expect(r.complete).toBe(true);
    const tokens = r.balances.filter((b) => b.asset.kind === 'token');
    expect(tokens.map((t) => t.asset.symbol)).toEqual(['WETH']);
    const weth = tokens[0];
    if (!weth) throw new Error('expected WETH');
    expect(formatRawAmount(weth.rawAmount, 18)).toBe('2');
    expect(r.notes.map((n) => n.code)).toEqual(['no_decimals']);
  });

  it('skips metadata calls for assets already known', async () => {
    const fetch = withAlchemy();
    const sources = createSources({ ALCHEMY_API_KEY: 'k' }, { fetch, sleep: noSleep });
    await sources.wallets.robinhood.fetchBalances(WALLET, {
      meter: new RequestMeter(),
      known: () => ({ decimals: 18 }),
    });
    expect(fetch.calls.some((c) => c.body?.method === 'alchemy_getTokenMetadata')).toBe(false);
  });

  it('is partial, with a clear note, when no Alchemy key is configured', async () => {
    const sources = createSources({}, { fetch: withAlchemy(), sleep: noSleep });
    const r = await sources.wallets.robinhood.fetchBalances(WALLET, ctx());
    expect(r.complete).toBe(false);
    expect(r.balances.map((b) => b.asset.kind)).toEqual(['native']);
    expect(r.notes[0]?.code).toBe('token_discovery_unavailable');
  });

  it('never exposes the API key in provider names or request keys', async () => {
    const sources = createSources(
      { ALCHEMY_API_KEY: 'SUPER-SECRET' },
      { fetch: withAlchemy(), sleep: noSleep },
    );
    const r = await sources.wallets.robinhood.fetchBalances(WALLET, ctx());
    expect(JSON.stringify(r.captures.map((c) => [c.provider, c.requestKey]))).not.toContain(
      'SUPER-SECRET',
    );
  });
});

describe('token discovery failures', () => {
  it("degrades to partial with the provider's explanation, keeping native balances and hiding the key", async () => {
    const KEY = 'SUPER-SECRET-KEY';
    const fetch = fakeFetch([
      rpc('eth_getBalance', fixture('robinhood-eth_getBalance.json')),
      (req) =>
        req.body?.method === 'alchemy_getTokenBalances'
          ? new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                error: {
                  code: -32600,
                  message: `ROBINHOOD_MAINNET is not enabled for this app (key ${KEY}).`,
                },
              }),
              { status: 403 },
            )
          : undefined,
    ]);
    const sources = createSources({ ALCHEMY_API_KEY: KEY }, { fetch, sleep: noSleep });
    const r = await sources.wallets.robinhood.fetchBalances(`0x${'1'.repeat(40)}`, {
      meter: new RequestMeter(),
      known: () => undefined,
    });
    expect(r.complete).toBe(false);
    expect(r.balances.map((b) => b.asset.kind)).toEqual(['native']);
    const note = r.notes.find((n) => n.code === 'token_discovery_failed');
    expect(note?.message).toContain('not enabled for this app');
    expect(note?.message).not.toContain(KEY);
    // Native balance came from the public RPC, not Alchemy.
    expect(fetch.calls[0]?.url).toContain('rpc.mainnet.chain.robinhood.com');
  });
});
