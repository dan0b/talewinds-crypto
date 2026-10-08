import { formatRawAmount } from '@talewinds/core';
import { describe, expect, it } from 'vitest';
import { createSources } from '../../index.ts';
import { RequestMeter } from '../../shared/meter.ts';
import { fakeFetch, fixture, get, noSleep, rpc } from '../../testing/fake-fetch.ts';
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from './rpc.ts';

const CIRCLE_DEV = '5TYZChz7APFopR5QirD5of4rQj1p9AXxeSAg6JndBdGj';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const routes = () =>
  fakeFetch([
    rpc('getBalance', fixture('solana-getBalance.json')),
    rpc('getTokenAccountsByOwner', fixture('solana-tokenAccounts-token.json'), (p) =>
      JSON.stringify(p).includes(TOKEN_PROGRAM),
    ),
    rpc('getTokenAccountsByOwner', fixture('solana-tokenAccounts-token2022.json'), (p) =>
      JSON.stringify(p).includes(TOKEN_2022_PROGRAM),
    ),
    get('/tokens/v2/search', fixture('jupiter-search.json')),
  ]);

describe('Solana via RPC + Jupiter', () => {
  it('reads SOL plus tokens from both token programs, with decimals from chain', async () => {
    const sources = createSources({}, { fetch: routes(), sleep: noSleep });
    const r = await sources.wallets.solana.fetchBalances(CIRCLE_DEV, {
      meter: new RequestMeter(),
      known: () => undefined,
    });
    expect(r.complete).toBe(true);
    const sol = r.balances.find((b) => b.asset.kind === 'native');
    expect(sol?.asset.ref).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501');
    const usdc = r.balances.find((b) => b.asset.address === USDC);
    expect(usdc?.asset).toMatchObject({
      symbol: 'USDC',
      decimals: 6,
      decimalsSource: 'solana-rpc',
    });
    expect(usdc?.asset.providerVerified).toBe(true); // Jupiter-verified
    if (!usdc) throw new Error('expected USDC');
    expect(formatRawAmount(usdc.rawAmount, 6)).toMatch(/^\d+\.?\d*$/);
    // At least one Token-2022 account from the second program
    expect(r.captures.filter((c) => c.requestKey.includes(TOKEN_2022_PROGRAM))).toHaveLength(1);
  });

  it('skips Jupiter lookups for mints it already knows', async () => {
    const fetch = routes();
    const sources = createSources({}, { fetch, sleep: noSleep });
    await sources.wallets.solana.fetchBalances(CIRCLE_DEV, {
      meter: new RequestMeter(),
      known: () => ({ decimals: 6 }),
    });
    expect(fetch.calls.some((c) => c.url.includes('/tokens/v2/search'))).toBe(false);
  });

  it('marks unknown mints unverified with no metadata, rather than guessing', async () => {
    const sources = createSources({}, { fetch: routes(), sleep: noSleep });
    const r = await sources.wallets.solana.fetchBalances(CIRCLE_DEV, {
      meter: new RequestMeter(),
      known: () => undefined,
    });
    const unknown = r.balances.filter(
      (b) => b.asset.kind === 'token' && b.asset.metadataSource === null,
    );
    for (const b of unknown) {
      expect(b.asset.symbol).toBeNull();
      expect(b.asset.providerVerified).toBe(false);
    }
  });
});
