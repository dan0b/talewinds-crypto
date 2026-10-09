import { generateKeyPairSync, verify } from 'node:crypto';
import { formatRawAmount, VENUE_DECIMALS } from '@talewinds/core';
import { describe, expect, it } from 'vitest';
import { createSources } from '../../index.ts';
import { RequestMeter } from '../../shared/meter.ts';
import { fakeFetch, fixture, get, noSleep, type Route } from '../../testing/fake-fetch.ts';
import { coinbaseAuthorizer } from './auth.ts';
import { KeyPermissionError } from './index.ts';

const KEY_NAME = 'organizations/test-org/apiKeys/test-key';
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PEM = ec.privateKey.export({ type: 'sec1', format: 'pem' }).toString();

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

describe('Coinbase request signing (ADR 0017)', () => {
  it('builds a valid ES256 JWT per request, scoped to method + host + path', () => {
    const authorize = coinbaseAuthorizer(
      { keyName: KEY_NAME, privateKeyPem: PEM },
      { now: () => 1_791_400_000_000 },
    );
    const token = authorize('get', '/api/v3/brokerage/accounts?limit=250').authorization ?? '';
    expect(token).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const [header, claims, signature] = token.slice('Bearer '.length).split('.') as [
      string,
      string,
      string,
    ];

    expect(decode(header)).toMatchObject({ alg: 'ES256', kid: KEY_NAME, typ: 'JWT' });
    expect(decode(header).nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(decode(claims)).toEqual({
      iss: 'cdp',
      sub: KEY_NAME,
      nbf: 1_791_400_000,
      exp: 1_791_400_120,
      uri: 'GET api.coinbase.com/api/v3/brokerage/accounts',
    });
    const valid = verify(
      'sha256',
      Buffer.from(`${header}.${claims}`),
      { key: ec.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url'),
    );
    expect(valid).toBe(true);

    const again = authorize('GET', '/api/v3/brokerage/accounts').authorization ?? '';
    expect(decode(again.slice(7).split('.')[0] as string).nonce).not.toBe(decode(header).nonce);
  });

  it('accepts a PEM pasted with literal \\n sequences', () => {
    const oneLine = PEM.trim().replace(/\n/g, '\\n');
    const authorize = coinbaseAuthorizer({ keyName: KEY_NAME, privateKeyPem: oneLine });
    expect(authorize('GET', '/x').authorization).toMatch(/^Bearer /);
  });

  it('refuses Ed25519 and unreadable keys, without echoing them', () => {
    const ed = generateKeyPairSync('ed25519')
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(() => coinbaseAuthorizer({ keyName: KEY_NAME, privateKeyPem: ed })('GET', '/x')).toThrow(
      /ECDSA \(P-256\)/,
    );
    const garbage = '-----BEGIN EC PRIVATE KEY-----\nnot-a-key\n-----END EC PRIVATE KEY-----';
    let message = '';
    try {
      coinbaseAuthorizer({ keyName: KEY_NAME, privateKeyPem: garbage })('GET', '/x');
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe('COINBASE_API_PRIVATE_KEY could not be read as a PEM private key');
    expect(message).not.toContain('not-a-key');
  });
});

const env = { COINBASE_API_KEY_NAME: KEY_NAME, COINBASE_API_PRIVATE_KEY: PEM };

const accounts: Route = (req) => {
  if (req.method !== 'GET' || !req.url.includes('/api/v3/brokerage/accounts')) return undefined;
  return req.url.includes('cursor=page-2-cursor')
    ? fixture('coinbase-accounts-page2.json')
    : fixture('coinbase-accounts-page1.json');
};

function routes(permissions: unknown = fixture('coinbase-key-permissions.json')) {
  return fakeFetch([
    get('/api/v3/brokerage/key_permissions', permissions),
    accounts,
    get('/api/v3/brokerage/portfolios/', fixture('coinbase-portfolio-breakdown.json')),
  ]);
}

describe('Coinbase balances', () => {
  it('reads every account exactly: available + hold, summed per currency, across pages', async () => {
    const fetch = routes();
    const sources = createSources(env, { fetch, sleep: noSleep });
    const coinbase = sources.venueBalances.coinbase;
    if (!coinbase) throw new Error('expected a Coinbase source');
    const r = await coinbase.fetchBalances(
      { address: null },
      { meter: new RequestMeter(), known: () => undefined },
    );

    const amounts = Object.fromEntries(
      r.balances.map((b) => [b.asset.ref, formatRawAmount(b.rawAmount, VENUE_DECIMALS)]),
    );
    expect(amounts).toEqual({
      'venue:coinbase/currency:ETH': '0.85', // 0.5 available + 0.25 on hold + 0.1 in a vault
      'venue:coinbase/currency:USD': '120.5',
      'venue:coinbase/currency:USDC': '1000',
      'venue:coinbase/currency:SOL': '2.123456789012345678',
    });
    expect(r.balances[0]?.asset).toMatchObject({
      kind: 'venue',
      chainId: 'venue:coinbase',
      address: null,
      symbol: 'ETH',
      decimals: VENUE_DECIMALS,
      providerVerified: true,
    });

    // Gaps are reported, never papered over: a 19-decimal amount, and staked SOL.
    expect(r.complete).toBe(false);
    expect(r.notes.map((n) => n.code)).toEqual([
      'venue_amount_unreadable',
      'venue_staked_not_included',
    ]);
    expect(r.notes[1]?.message).toContain('staked SOL worth about $57.48');

    // Every request is signed, and nothing secret ends up in the stored request keys.
    expect(fetch.calls.every((c) => c.headers.authorization?.startsWith('Bearer '))).toBe(true);
    expect(r.captures.map((c) => c.requestKey)).toEqual([
      'key_permissions',
      'accounts(page 1)',
      'accounts(page 2)',
      'portfolio_breakdown',
    ]);
  });

  it('refuses a key that can trade or transfer, before reading any balance', async () => {
    const fetch = routes({
      ...(fixture('coinbase-key-permissions.json') as object),
      can_trade: true,
    });
    const sources = createSources(env, { fetch, sleep: noSleep });
    const read = sources.venueBalances.coinbase?.fetchBalances(
      { address: null },
      { meter: new RequestMeter(), known: () => undefined },
    );
    await expect(read).rejects.toBeInstanceOf(KeyPermissionError);
    await expect(read).rejects.toThrow('can trade');
    expect(fetch.calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/api/v3/brokerage/key_permissions',
    ]);
  });

  it('has no Coinbase source without a key', () => {
    expect(createSources({}).venueBalances.coinbase).toBeNull();
    expect(createSources({}).venues).toEqual({ coinbase: false, hyperliquid: true });
  });
});

describe('Coinbase prices (public, no key)', () => {
  it('uses the <CODE>-USD market, then Coinbase exchange rates; unknown codes are missing', async () => {
    const fetch = fakeFetch([
      get('/api/v3/brokerage/market/products', fixture('coinbase-market-products.json')),
      get('/v2/exchange-rates', fixture('coinbase-exchange-rates.json')),
    ]);
    const sources = createSources({}, { fetch, sleep: noSleep });
    const ref = (code: string) => `venue:coinbase/currency:${code}` as never;
    const r = await sources.venuePrices.fetchPrices(
      ['ETH', 'SOL', 'USDC', 'USD', 'NOPE'].map((code) => ({
        ref: ref(code),
        venue: 'coinbase' as const,
        code,
      })),
      { meter: new RequestMeter() },
    );

    const bySymbol = Object.fromEntries(
      r.quotes.map((q) => [q.ref.split(':').at(-1), [q.priceUsd, q.source, q.confidence]]),
    );
    const products = fixture('coinbase-market-products.json') as {
      products: { product_id: string; price: string }[];
    };
    const marketPrice = (id: string) => products.products.find((p) => p.product_id === id)?.price;
    expect(bySymbol).toEqual({
      ETH: [marketPrice('ETH-USD'), 'coinbase', 'high'],
      SOL: [marketPrice('SOL-USD'), 'coinbase', 'high'],
      USDC: ['1', 'coinbase-rates', 'high'],
      USD: ['1', 'coinbase-rates', 'high'],
    });
    expect(r.missing).toEqual([ref('NOPE')]);
    // USD is the unit: it's never asked for as a market.
    const asked = new URL(fetch.calls[0]?.url ?? '').searchParams.getAll('product_ids');
    expect(asked).toEqual(['ETH-USD', 'SOL-USD', 'USDC-USD', 'NOPE-USD']);
    expect(fetch.calls.every((c) => !c.headers.authorization)).toBe(true);
  });
});
