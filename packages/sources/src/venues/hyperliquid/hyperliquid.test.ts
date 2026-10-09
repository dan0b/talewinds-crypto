import { type AssetRef, Dec, formatRawAmount, VENUE_DECIMALS } from '@talewinds/core';
import { describe, expect, it } from 'vitest';
import { createSources } from '../../index.ts';
import { RequestMeter } from '../../shared/meter.ts';
import { fakeFetch, fixture, noSleep, type Route } from '../../testing/fake-fetch.ts';
import type { PriceReading, VenuePriceSource } from '../../types.ts';
import { combineVenuePrices } from '../index.ts';

/** Hyperliquid's Assistance Fund: a well-known public account (fixtures recorded 2026-10-08). */
const AF = '0xfefefefefefefefefefefefefefefefefefefefe';

/** Match an info request by its `type` (and optionally its market). */
const info =
  (type: string, reply: unknown, coin?: string): Route =>
  (req) => {
    const body = req.body as { type?: string; coin?: string } | undefined;
    if (req.method !== 'POST' || !req.url.endsWith('/info') || body?.type !== type)
      return undefined;
    return coin && body.coin !== coin ? undefined : reply;
  };

const accountRoutes = (overrides: Route[] = []) =>
  fakeFetch([
    ...overrides,
    info('spotClearinghouseState', fixture('hyperliquid-spot-state.json')),
    info('clearinghouseState', fixture('hyperliquid-perps-state.json')),
    info('userVaultEquities', []),
    info('delegatorSummary', fixture('hyperliquid-delegator-summary.json')),
    info('subAccounts', fixture('hyperliquid-sub-accounts.json')),
  ]);

const read = (fetch: ReturnType<typeof fakeFetch>, address: string | null = AF) => {
  const source = createSources({}, { fetch, sleep: noSleep }).venueBalances.hyperliquid;
  if (!source) throw new Error('expected a Hyperliquid source');
  return source.fetchBalances({ address }, { meter: new RequestMeter(), known: () => undefined });
};

describe('Hyperliquid balances (public info API)', () => {
  it('reads spot balances exactly, and counts the perps account value as USDC', async () => {
    const fetch = accountRoutes();
    const r = await read(fetch);
    const amounts = Object.fromEntries(
      r.balances.map((b) => [b.asset.symbol, formatRawAmount(b.rawAmount, VENUE_DECIMALS)]),
    );
    const spot = fixture('hyperliquid-spot-state.json') as {
      balances: { coin: string; total: string }[];
    };
    const perps = fixture('hyperliquid-perps-state.json') as {
      marginSummary: { accountValue: string };
    };
    const spotUsdc = spot.balances.find((b) => b.coin === 'USDC')?.total as string;
    expect(amounts).toEqual({
      // Spot USDC (on hold included) + the perps account's value.
      USDC: new Dec(spotUsdc).plus(perps.marginSummary.accountValue).toFixed(),
      PURR: '0.62505',
      HYPE: '47917750.3547392264',
    }); // the zero USDE balance is dropped
    expect(r.balances[0]?.asset).toMatchObject({
      ref: 'venue:hyperliquid/currency:USDC',
      chainId: 'venue:hyperliquid',
      kind: 'venue',
      providerVerified: true,
    });
    expect(r.complete).toBe(true);
    expect(r.notes.map((n) => n.code)).toEqual(['venue_perps_equity_included']);
    // Every read is a public POST for this address; nothing is signed.
    expect(
      fetch.calls.every(
        (c) => (c.body as { user?: string }).user === AF && !c.headers.authorization,
      ),
    ).toBe(true);
  });

  it('reports vault deposits, staked HYPE, and sub-accounts as gaps instead of leaving them out', async () => {
    const r = await read(
      accountRoutes([
        info('userVaultEquities', fixture('hyperliquid-vault-equities.json')),
        info('delegatorSummary', {
          delegated: '10.5',
          undelegated: '0.0',
          totalPendingWithdrawal: '1.0',
          nPendingWithdrawals: 1,
        }),
        info('subAccounts', [
          { name: 'sub', subAccountUser: '0x00000000000000000000000000000000000000aa' },
        ]),
      ]),
    );
    expect(r.complete).toBe(false);
    expect(r.notes.map((n) => n.code)).toEqual([
      'venue_perps_equity_included',
      'venue_vaults_not_included',
      'venue_staked_not_included',
      'venue_sub_accounts_not_included',
    ]);
    expect(r.notes[1]?.message).toContain('Vault deposits (2, worth about $4175650.06)');
    expect(r.notes[2]?.message).toContain('Staked HYPE (11.5 HYPE)');
  });

  it('needs an address', async () => {
    await expect(read(accountRoutes(), null)).rejects.toThrow('0x address');
  });
});

describe('Hyperliquid prices', () => {
  const ref = (code: string) => `venue:hyperliquid/currency:${code}` as AssetRef;
  const inputs = ['HYPE', 'USDC', 'NOPE'].map((code) => ({
    ref: ref(code),
    venue: 'hyperliquid' as const,
    code,
  }));

  it('prices tokens at their USDC market mid, with bid depth as liquidity; USDC is the quote', async () => {
    const fetch = fakeFetch([
      info('spotMeta', fixture('hyperliquid-spot-meta.json')),
      info('l2Book', fixture('hyperliquid-l2book-hype.json'), '@107'),
    ]);
    const sources = createSources({}, { fetch, sleep: noSleep });
    const r = await sources.venuePrices.fetchPrices(inputs, { meter: new RequestMeter() });

    const book = fixture('hyperliquid-l2book-hype.json') as {
      levels: [{ px: string; sz: string }[], { px: string; sz: string }[]];
    };
    const [bids, asks] = book.levels;
    const mid = new Dec(bids[0]?.px as string).plus(asks[0]?.px as string).div(2);
    const depth = bids.reduce((s, l) => s.plus(new Dec(l.px).times(l.sz)), new Dec(0));
    const hype = r.quotes.find((q) => q.ref === ref('HYPE'));
    expect(hype).toMatchObject({
      priceUsd: mid.toFixed(),
      source: 'hyperliquid',
      confidence: 'high',
      liquidityUsd: depth.toFixed(2),
    });
    expect(r.quotes.find((q) => q.ref === ref('USDC'))).toMatchObject({
      priceUsd: '1',
      source: 'hyperliquid-quote',
    });
    expect(r.missing).toEqual([ref('NOPE')]);

    // The market list is cached: a second round only asks for the order book.
    await sources.venuePrices.fetchPrices(inputs.slice(0, 1), { meter: new RequestMeter() });
    const asked = fetch.calls.map((c) => (c.body as { type: string }).type);
    expect(asked).toEqual(['spotMeta', 'l2Book', 'l2Book']);
  });
});

describe('combining venue prices', () => {
  const fail: VenuePriceSource = {
    async fetchPrices() {
      throw new Error('upstream down');
    },
  };
  const one: VenuePriceSource = {
    async fetchPrices(inputs): Promise<PriceReading> {
      return {
        captures: [{ provider: 'x', requestKey: 'x', payload: {}, fetchedAt: new Date() }],
        quotes: inputs.map((i) => ({
          ref: i.ref,
          priceUsd: '1',
          confidence: 'high' as const,
          pricedAt: new Date(),
          source: 'x',
          captureIndex: 0,
          marketCapUsd: null,
          fdvUsd: null,
          liquidityUsd: null,
          crossCheck: null,
          verifies: false,
        })),
        missing: [],
        notes: [],
      };
    },
  };

  it("turns one venue's outage into a note, without putting its assets on the miss cooldown", async () => {
    const combined = combineVenuePrices({ coinbase: fail, hyperliquid: one });
    const r = await combined.fetchPrices(
      [
        { ref: 'venue:coinbase/currency:ETH' as AssetRef, venue: 'coinbase', code: 'ETH' },
        { ref: 'venue:hyperliquid/currency:HYPE' as AssetRef, venue: 'hyperliquid', code: 'HYPE' },
      ],
      { meter: new RequestMeter() },
    );
    expect(r.quotes.map((q) => q.ref)).toEqual(['venue:hyperliquid/currency:HYPE']);
    expect(r.missing).toEqual([]);
    expect(r.notes).toEqual([
      { code: 'price_source_failed', message: 'coinbase prices: upstream down' },
    ]);
  });
});
