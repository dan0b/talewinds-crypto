import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fakeFetch, noSleep } from '../testing/fake-fetch.ts';
import { ProviderError } from './errors.ts';
import { ProviderClient } from './http.ts';
import { parseProviderJson } from './json.ts';
import { RateLimiter } from './limiter.ts';
import { RequestMeter } from './meter.ts';

const SECRET_URL = 'https://robinhood-mainnet.g.alchemy.com/v2/SUPER-SECRET-KEY';
const ctx = () => ({ meter: new RequestMeter(), requestKey: 'test' });

const client = (fetch: ReturnType<typeof fakeFetch>) =>
  new ProviderClient({
    provider: 'test',
    baseUrl: SECRET_URL,
    minIntervalMs: 0,
    fetch,
    sleep: noSleep,
  });

describe('ProviderClient', () => {
  it('retries 429s and 5xx, then succeeds', async () => {
    let n = 0;
    const fetch = fakeFetch([
      () => (++n < 3 ? new Response('slow down', { status: n === 1 ? 429 : 503 }) : { ok: true }),
    ]);
    const c = ctx();
    const res = await client(fetch).getJson('/x', z.object({ ok: z.boolean() }), c);
    expect(res.data.ok).toBe(true);
    expect(c.meter.total).toBe(3); // every attempt is metered
  });

  it('gives up after max retries with an error that never includes the URL or key', async () => {
    const fetch = fakeFetch([() => new Response('', { status: 500 })]);
    const err = await client(fetch)
      .getJson('/x', z.unknown(), ctx())
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(String((err as Error).message)).not.toMatch(/SECRET|alchemy\.com/);
    expect(fetch.calls).toHaveLength(4);
  });

  it('reports a bot-protection HTML page as a clear error', async () => {
    const fetch = fakeFetch([() => new Response('<!DOCTYPE html><title>Just a moment...</title>')]);
    await expect(client(fetch).getJson('/x', z.unknown(), ctx())).rejects.toThrow(/not JSON/);
  });

  it('rejects responses that fail validation, naming the path', async () => {
    const fetch = fakeFetch([() => ({ items: [{ amount: 'lots' }] })]);
    const schema = z.object({ items: z.array(z.object({ amount: z.number() })) });
    await expect(client(fetch).getJson('/x', schema, ctx())).rejects.toThrow(/items\.0\.amount/);
  });

  it('does not retry client errors', async () => {
    const fetch = fakeFetch([() => new Response('nope', { status: 403 })]);
    await expect(client(fetch).getJson('/x', z.unknown(), ctx())).rejects.toThrow(/HTTP 403/);
    expect(fetch.calls).toHaveLength(1);
  });

  it('captures the raw payload with the secret-free request key', async () => {
    const fetch = fakeFetch([() => ({ a: 1 })]);
    const res = await client(fetch).getJson('/x', z.object({ a: z.number() }), {
      meter: new RequestMeter(),
      requestKey: 'GET /x',
    });
    expect(res.raw).toMatchObject({ provider: 'test', requestKey: 'GET /x', payload: { a: 1 } });
  });
});

describe('parseProviderJson', () => {
  it('keeps integers above 2^53 exact', () => {
    const out = parseProviderJson(
      '{"lamports": 18446744073709551615, "n": 42, "p": 1.25}',
    ) as Record<string, unknown>;
    expect(out.lamports).toBe('18446744073709551615');
    expect(out.n).toBe(42);
    expect(out.p).toBe(1.25);
  });
});

describe('RateLimiter', () => {
  it('spaces request starts by the minimum interval', async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter(
      100,
      async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      () => clock,
    );
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    expect(waits).toEqual([100, 100]);
  });
});
