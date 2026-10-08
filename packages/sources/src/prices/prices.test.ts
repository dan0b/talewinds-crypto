import { CHAINS, nativeAssetRef, tokenAssetRef } from '@talewinds/core';
import { describe, expect, it } from 'vitest';
import { ProviderClient } from '../shared/http.ts';
import { RequestMeter } from '../shared/meter.ts';
import { fakeFetch, fixture, get, noSleep, type Route } from '../testing/fake-fetch.ts';
import type { PricingInput } from '../types.ts';
import { createPriceSource, deviation, type PriceLimits } from './index.ts';

const WETH_RH = '0x0bd7d308f8e1639fab988df18a8011f41eacad73';
const WALLET_RH = '0x0339f5459fc690ac85f1782e15782a151b4a9e1b';
const MOIN = '8DXqVUopcdviLvujTcpwEqkKzB43Arp6E1axzsEE5Btq';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const input = (chainKey: 'ethereum' | 'robinhood' | 'solana', address?: string): PricingInput => ({
  ref: address ? tokenAssetRef(CHAINS[chainKey], address) : nativeAssetRef(CHAINS[chainKey]),
  chainKey,
  kind: address ? 'token' : 'native',
  address: address ?? null,
});

const post =
  (urlPart: string, reply: unknown): Route =>
  (req) =>
    req.method === 'POST' && req.url.includes(urlPart) ? reply : undefined;

function source(routes: Route[], limits?: PriceLimits) {
  const fetch = fakeFetch(routes);
  const client = (provider: string, baseUrl: string) =>
    new ProviderClient({ provider, baseUrl, minIntervalMs: 0, fetch, sleep: noSleep });
  const prices = createPriceSource(
    {
      defillama: client('defillama', 'https://coins.llama.fi'),
      dexscreener: client('dexscreener', 'https://api.dexscreener.com'),
      jupiter: client('jupiter', 'https://lite-api.jup.ag'),
    },
    limits,
  );
  return { prices, fetch };
}

const meter = () => ({ meter: new RequestMeter() });

describe('native assets', () => {
  it('are priced by DefiLlama, with market cap from its /mcaps endpoint', async () => {
    const { prices, fetch } = source([
      get('/prices/current/', fixture('defillama-current.json')),
      post('/mcaps', fixture('defillama-mcaps.json')),
    ]);
    const r = await prices.fetchPrices(
      [input('ethereum'), input('robinhood'), input('solana')],
      meter(),
    );
    expect(r.quotes).toHaveLength(3);
    for (const q of r.quotes) {
      expect(q).toMatchObject({ source: 'defillama', confidence: 'high', verifies: true });
      expect(Number(q.marketCapUsd)).toBeGreaterThan(1e10);
    }
    // Robinhood Chain's native asset is ETH, priced (and capped) as coingecko:ethereum
    expect(fetch.calls[0]?.url).toContain('coingecko%3Aethereum');
  });
});

describe('Solana tokens (Jupiter first)', () => {
  const routes = [
    get('/prices/current/', fixture('defillama-moin-disagreement.json')),
    get('/tokens/v2/search', fixture('jupiter-search-market.json')),
  ];

  it('regression: uses the on-chain price when DefiLlama is ~100× off, and flags it', async () => {
    const { prices } = source(routes);
    const r = await prices.fetchPrices([input('solana', MOIN)], meter());
    const q = r.quotes[0];
    expect(q?.source).toBe('jupiter');
    expect(Number(q?.priceUsd)).toBeLessThan(0.001); // not DefiLlama's $0.0204
    expect(q?.crossCheck?.source).toBe('defillama');
    expect(q).toMatchObject({ confidence: 'low', verifies: false });
    expect(Number(q?.marketCapUsd)).toBeGreaterThan(0);
    expect(Number(q?.liquidityUsd)).toBeGreaterThan(0);
    expect(r.notes.map((n) => n.code)).toContain('price_disagreement');
  });

  it('verifies deep, agreeing tokens and carries market data', async () => {
    const { prices } = source(routes);
    const r = await prices.fetchPrices([input('solana', USDC_SOL)], meter());
    expect(r.quotes[0]).toMatchObject({
      source: 'jupiter',
      confidence: 'high',
      verifies: true,
      crossCheck: null,
    });
    expect(Number(r.quotes[0]?.fdvUsd)).toBeGreaterThan(1e9);
  });
});

describe('EVM tokens (deepest DexScreener pool first)', () => {
  it('prices from the pool and verifies when DefiLlama agrees', async () => {
    const { prices } = source([
      get('/prices/current/', fixture('defillama-current.json')),
      get('/tokens/v1/robinhood/', fixture('dexscreener-robinhood.json')),
    ]);
    const r = await prices.fetchPrices([input('robinhood', WETH_RH)], meter());
    expect(r.quotes[0]).toMatchObject({
      source: 'dexscreener',
      confidence: 'high',
      verifies: true,
    });
    expect(r.quotes[0]?.liquidityUsd).not.toBeNull();
  });

  it('never verifies from a pool price alone', async () => {
    const { prices } = source([
      get('/prices/current/', { coins: {} }),
      get('/tokens/v1/robinhood/', fixture('dexscreener-robinhood.json')),
    ]);
    const r = await prices.fetchPrices([input('robinhood', WETH_RH)], meter());
    expect(r.quotes[0]).toMatchObject({ source: 'dexscreener', verifies: false });
  });

  it('falls back to DefiLlama when no pool exists', async () => {
    const { prices } = source([
      get('/prices/current/', fixture('defillama-current.json')),
      get('/tokens/v1/', []),
    ]);
    const r = await prices.fetchPrices([input('robinhood', WETH_RH)], meter());
    expect(r.quotes[0]).toMatchObject({ source: 'defillama', marketCapUsd: null });
  });
});

describe('caps and missing', () => {
  it('reports as missing only what every applicable source was asked about', async () => {
    const routes = [get('/prices/current/', { coins: {} }), get('/tokens/v1/', [])];
    const tokens = [input('robinhood', WETH_RH), input('robinhood', WALLET_RH)];
    const capped = source(routes, {
      maxDefillamaRequests: 5,
      maxJupiterRequests: 5,
      maxDexscreenerRequests: 0,
    });
    expect((await capped.prices.fetchPrices(tokens, meter())).missing).toEqual([]);
    const full = source(routes);
    expect((await full.prices.fetchPrices(tokens, meter())).missing).toHaveLength(2);
  });

  it('marks DefiLlama-only prices as low confidence when the on-chain check was skipped', async () => {
    const { prices } = source(
      [get('/prices/current/', fixture('defillama-current.json')), get('/tokens/v1/', [])],
      { maxDefillamaRequests: 5, maxJupiterRequests: 5, maxDexscreenerRequests: 0 },
    );
    const r = await prices.fetchPrices([input('robinhood', WETH_RH)], meter());
    expect(r.quotes[0]).toMatchObject({ source: 'defillama', confidence: 'low', verifies: false });
    expect(r.notes.map((n) => n.code)).toContain('onchain_check_skipped');
  });

  it('notes assets left unpriced by the DefiLlama request cap', async () => {
    const { prices } = source([get('/prices/current/', { coins: {} }), get('/tokens/v1/', [])], {
      maxDefillamaRequests: 1,
      maxJupiterRequests: 1,
      maxDexscreenerRequests: 1,
    });
    const many = Array.from({ length: 60 }, (_, i) =>
      input('ethereum', `0x${i.toString(16).padStart(40, '0')}`),
    );
    const r = await prices.fetchPrices(many, meter());
    expect(r.notes[0]?.code).toBe('price_cap');
  });
});

describe('deviation', () => {
  it('measures relative difference exactly', () => {
    expect(deviation('0.020425', '0.000202')).toBeGreaterThan(99);
    expect(deviation('1.10', '1.00')).toBeCloseTo(0.1);
  });
});
