import { CHAINS, nativeAssetRef, tokenAssetRef } from '@talewinds/core';
import {
  addAccount,
  firstUsableRunAt,
  pricesPerStep,
  saveRawRecords,
  schema,
  snapshotsOfRuns,
  upsertAssets,
  usableRunsPerStep,
} from '@talewinds/db';
import { createTestDatabase, resetDatabase } from '@talewinds/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { portfolioConfig } from './config.ts';
import { getValueHistory } from './history.ts';
import { getHoldings } from './holdings.ts';

const { db, close } = createTestDatabase();
beforeEach(() => resetDatabase(db));
afterAll(() => close());

const RH = CHAINS.robinhood;
const MAIN = '0x00000000000000000000000000000000000000aa';
const SECOND = '0x00000000000000000000000000000000000000bb';
const JUNK = '0x00000000000000000000000000000000000000b2';
const NOW = new Date('2026-10-08T12:05:00Z');
const STEP = 15 * 60_000;
const config = portfolioConfig(15);

/** A time on Oct 8 (UTC), e.g. at('11:10'). */
const at = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00Z`);
const plus30s = (d: Date) => new Date(d.getTime() + 30_000);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/** Two owned wallets on Robinhood Chain, ETH (verified) and JUNK (unverified), and helpers. */
async function setup() {
  const owned = (address: string, label: string) =>
    addAccount(db, { kind: 'wallet', chain: 'robinhood', address, ownership: 'owned', label });
  const main = (await owned(MAIN, 'main')).account;
  const second = (await owned(SECOND, 'second')).account;
  const [rawRecordId] = await saveRawRecords(db, [
    { provider: 'test', requestKey: 'seed', payload: { seed: true }, fetchedAt: NOW },
  ]);
  const meta = { chainId: RH.id, decimals: 18, decimalsSource: 'test', metadataSource: 'test' };
  const byRef = await upsertAssets(db, [
    {
      ...meta,
      ref: nativeAssetRef(RH),
      kind: 'native',
      address: null,
      symbol: 'ETH',
      name: 'Ether',
      initialStatus: 'verified',
    },
    {
      ...meta,
      ref: tokenAssetRef(RH, JUNK),
      kind: 'token',
      address: JUNK,
      symbol: 'JUNK',
      name: 'JUNK',
      initialStatus: 'unverified',
    },
  ]);
  const eth = byRef.get(nativeAssetRef(RH))?.id as string;
  const junk = byRef.get(tokenAssetRef(RH, JUNK))?.id as string;

  /** A sync run started at `start`, finished 30 seconds later, holding these raw amounts. */
  const run = async (
    accountId: string,
    start: Date,
    held: [string, string][] = [],
    status = 'succeeded',
  ) => {
    const finishedAt = plus30s(start);
    const [row] = await db
      .insert(schema.syncRuns)
      .values({ accountId, kind: 'balances', status, startedAt: start, finishedAt })
      .returning({ id: schema.syncRuns.id });
    if (!row) throw new Error('run not inserted');
    if (held.length > 0) {
      await db.insert(schema.balanceSnapshots).values(
        held.map(([assetId, rawAmount]) => ({
          syncRunId: row.id,
          accountId,
          assetId,
          rawAmount,
          observedAt: finishedAt,
          rawRecordId: rawRecordId as string,
        })),
      );
    }
    return row.id;
  };
  const price = (assetId: string, priceUsd: string, pricedAt: Date) =>
    db.insert(schema.priceObservations).values({
      assetId,
      priceUsd,
      source: 'test',
      confidence: 'high',
      pricedAt,
      fetchedAt: pricedAt,
      rawRecordId: rawRecordId as string,
    });
  return { main, second, eth, junk, run, price };
}

describe('per-step queries', () => {
  it('keeps each account’s newest usable run per step, plus its newest before the range', async () => {
    const { main, run } = await setup();
    await run(main.id, at('09:00'), [], 'failed'); // never counts
    await run(main.id, at('10:00'));
    const before = await run(main.id, at('10:50')); // the newest finished by 11:00
    await run(main.id, at('11:01'));
    const step1100 = await run(main.id, at('11:10')); // newest-started in 11:00–11:15
    const step1115 = await run(main.id, at('11:20'), [], 'partial'); // usable, and says so
    await run(main.id, at('11:31'), [], 'failed');
    const step1200 = await run(main.id, at('12:01'));

    const runs = await usableRunsPerStep(db, [main.id], at('11:00'), NOW, STEP);
    expect(runs.map((r) => r.id).sort()).toEqual([before, step1100, step1115, step1200].sort());
    expect(runs.find((r) => r.id === step1100)).toMatchObject({
      accountId: main.id,
      status: 'succeeded',
      startedAt: at('11:10'),
      finishedAt: plus30s(at('11:10')),
    });
    expect(runs.find((r) => r.id === step1115)?.status).toBe('partial');

    const first = await firstUsableRunAt(db, [main.id]);
    expect(first).toEqual(new Map([[main.id, plus30s(at('10:00'))]]));
  });

  it('keeps each asset’s newest price per step, plus its newest before the range', async () => {
    const { eth, price } = await setup();
    for (const [usd, time] of [
      ['1', '10:00'],
      ['2', '10:55'],
      ['3', '11:02'],
      ['4', '11:12'],
      ['5', '11:40'],
      ['6', '12:20'], // after "now": still the latest, as latestPrices sees it
    ] as const) {
      await price(eth, usd, at(time));
    }
    const prices = await pricesPerStep(db, [eth], at('11:00'), STEP);
    const seen = prices
      .sort((a, b) => a.pricedAt.getTime() - b.pricedAt.getTime())
      .map((p) => [p.priceUsd, hhmm(p.pricedAt)]);
    expect(seen).toEqual([
      ['2', '10:55'],
      ['4', '11:12'],
      ['5', '11:40'],
      ['6', '12:20'],
    ]);
  });

  it('reads the balances of runs with their decimals and current status', async () => {
    const { main, eth, junk, run } = await setup();
    const id = await run(main.id, at('11:10'), [
      [eth, '1000'],
      [junk, '5'],
    ]);
    const snapshots = await snapshotsOfRuns(db, [id]);
    expect(
      snapshots
        .map((s) => [s.assetId === eth ? 'ETH' : 'JUNK', s.rawAmount, s.decimals, s.status])
        .sort(),
    ).toEqual([
      ['ETH', '1000', 18, 'verified'],
      ['JUNK', '5', 18, 'unverified'],
    ]);
  });
});

describe('getValueHistory', () => {
  it('ends at the holdings total, for all wallets and for one', async () => {
    const { main, second, eth, junk, run, price } = await setup();
    await run(main.id, at('08:00'), [[eth, '1000000000000000000']]); // 1 ETH
    await run(main.id, at('12:00'), [
      [eth, '1234567890123456789'],
      [junk, '5000000000000000000'],
    ]);
    await run(second.id, at('11:45'), [[eth, '500000000000000001']]);
    await price(eth, '1999.995', at('07:00'));
    await price(eth, '2000.015', at('12:04'));
    await price(junk, '100', at('12:04'));

    const deps = { db, config, now: () => NOW };
    const history = await getValueHistory(deps, { range: '1d' });
    const holdings = await getHoldings(deps);
    expect(history.points).toHaveLength(97);
    expect(history.points.at(-1)).toEqual({
      at: NOW.toISOString(),
      valueUsd: holdings.totals.valueUsd,
      incomplete: false,
    });
    // Before the first sync: no value. 08:15: 1 ETH at $1,999.995, rounded half-even.
    const value = (time: string) =>
      history.points.find((p) => p.at === at(time).toISOString())?.valueUsd;
    expect(value('08:00')).toBeNull();
    expect(value('08:15')).toBe('2000.00');
    expect(value('09:00')).toBeNull(); // nothing synced for over 35 minutes
    // The second wallet arrived at 11:45: a step, not a gain, so no change is reported.
    expect(history.additions).toEqual([
      {
        at: plus30s(at('11:45')).toISOString(),
        walletId: second.walletId,
        name: 'second',
        places: ['Robinhood Chain'],
        valueUsd: '1000.00', // 0.500000000000000001 ETH at $1,999.995
      },
    ]);
    expect(history.summary.changeUsd).toBeNull();

    const walletId = main.walletId as string;
    const one = await getValueHistory(deps, { range: '1d', walletId });
    const oneHoldings = await getHoldings(deps, { walletId });
    expect(one.summary.endUsd).toBe(oneHoldings.totals.valueUsd);
    await expect(
      getValueHistory(deps, { range: '1d', walletId: '01a0e4bb-6c32-76e6-9590-ce717185cfff' }),
    ).rejects.toThrow('Unknown wallet');
  });
});
