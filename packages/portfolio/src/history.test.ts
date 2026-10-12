import { CHAINS } from '@talewinds/core';
import type {
  AccountRow,
  PriceObservationPoint,
  RunSnapshot,
  UsableRun,
  WalletRow,
} from '@talewinds/db';
import { describe, expect, it } from 'vitest';
import { portfolioConfig } from './config.ts';
import {
  buildValueHistory,
  historyGrid,
  historyWindow,
  type ValueHistory,
  type ValueHistoryInput,
} from './history.ts';

const NOW = new Date('2026-10-08T12:05:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const config = portfolioConfig(15);

const L1 = CHAINS.ethereum.id;
const RH = CHAINS.robinhood.id;

const wallet = (id: string, name: string): WalletRow => ({
  id,
  family: 'evm',
  address: `addr-${id}`,
  name,
  createdAt: NOW,
  updatedAt: NOW,
});

const account = (id: string, walletId: string, chainId: string): AccountRow => ({
  id,
  ref: `${chainId}:addr-${walletId}`,
  kind: 'wallet',
  ownership: 'owned',
  chainId,
  address: `addr-${walletId}`,
  venue: null,
  entityId: null,
  walletId,
  label: null,
  createdAt: NOW,
  updatedAt: NOW,
});

const coinbase: AccountRow = {
  id: 'cb',
  ref: 'venue:coinbase:main',
  kind: 'venue',
  ownership: 'owned',
  chainId: null,
  address: null,
  venue: 'coinbase',
  entityId: null,
  walletId: null,
  label: 'main',
  createdAt: NOW,
  updatedAt: NOW,
};

/** Asleep from 02:00 to 04:45 on Oct 8: no syncs started then. */
const asleep = (t: Date) =>
  t >= new Date('2026-10-08T02:00:00Z') && t <= new Date('2026-10-08T04:45:00Z');

/** A usable run every 15 minutes in [from, to], each finishing 30 seconds after it starts. */
function every15(
  accountId: string,
  from: string,
  to: string,
  options: {
    offsetMs?: number;
    skip?: (t: Date) => boolean;
    partial?: (t: Date) => boolean;
  } = {},
): UsableRun[] {
  const runs: UsableRun[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 15 * MIN) {
    const startedAt = new Date(t + (options.offsetMs ?? 0));
    if (options.skip?.(startedAt)) continue;
    runs.push({
      id: `${accountId}@${startedAt.toISOString()}`,
      accountId,
      status: options.partial?.(startedAt) ? 'partial' : 'succeeded',
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 30_000),
    });
  }
  return runs;
}

/** Every run holds the same amounts (decimals 0 keeps the arithmetic readable). */
const holding = (runs: UsableRun[], held: [string, string, string?][]): RunSnapshot[] =>
  runs.flatMap((r) =>
    held.map(([assetId, rawAmount, status = 'verified']) => ({
      syncRunId: r.id,
      accountId: r.accountId,
      assetId,
      rawAmount,
      decimals: 0,
      status,
    })),
  );

const price = (assetId: string, priceUsd: string, iso: string): PriceObservationPoint => ({
  assetId,
  priceUsd,
  source: 'test',
  pricedAt: new Date(iso),
});

function firstSyncs(runs: UsableRun[]): Map<string, Date> {
  const first = new Map<string, Date>();
  for (const r of runs) {
    const prev = first.get(r.accountId);
    if (!prev || r.finishedAt < prev) first.set(r.accountId, r.finishedAt);
  }
  return first;
}

/**
 * Wallet "Main" (Robinhood Chain: 1 ETH, 100 JUNK unverified) and Coinbase ($50) sync every 15
 * minutes from Oct 7 00:00 to Oct 8 12:00, except while asleep. Wallet "Late" (Ethereum: 1,000
 * USDC; Robinhood Chain: 1 ETH) is first synced on Oct 8 at 06:00. ETH is $1,000, then $1,100
 * from Oct 8 00:00, then $1,200 from 12:04.
 */
function input(overrides: Partial<ValueHistoryInput> = {}): ValueHistoryInput {
  const main = every15('a-rh', '2026-10-07T00:00:00Z', '2026-10-08T12:00:00Z', { skip: asleep });
  const cb = every15('cb', '2026-10-07T00:00:00Z', '2026-10-08T12:00:00Z', { skip: asleep });
  const lateL1 = every15('l-eth', '2026-10-08T06:00:00Z', '2026-10-08T12:00:00Z');
  const lateRh = every15('l-rh', '2026-10-08T06:00:00Z', '2026-10-08T12:00:00Z', {
    offsetMs: 10_000,
  });
  const runs = [...main, ...cb, ...lateL1, ...lateRh];
  return {
    range: '1d',
    now: NOW,
    config,
    walletId: null,
    accounts: [
      account('a-rh', 'main', RH),
      coinbase,
      account('l-rh', 'late', RH),
      account('l-eth', 'late', L1),
    ],
    wallets: [wallet('main', 'Main'), wallet('late', 'Late')],
    firstSyncAt: firstSyncs(runs),
    runs,
    snapshots: [
      ...holding(main, [
        ['eth', '1'],
        ['junk', '100', 'unverified'],
      ]),
      ...holding(cb, [['usd', '50']]),
      ...holding(lateL1, [['usdc', '1000']]),
      ...holding(lateRh, [['eth', '1']]),
    ],
    prices: [
      price('eth', '1000', '2026-10-06T23:00:00Z'),
      price('eth', '1100', '2026-10-08T00:00:00Z'),
      price('eth', '1200', '2026-10-08T12:04:00Z'),
      price('usdc', '1', '2026-10-06T23:00:00Z'),
      price('usd', '1', '2026-10-06T23:00:00Z'),
      price('junk', '5', '2026-10-06T23:00:00Z'),
    ],
    ...overrides,
  };
}

const valueAt = (history: ValueHistory, iso: string) =>
  history.points.find((p) => p.at === new Date(iso).toISOString())?.valueUsd;

describe('the grid', () => {
  it('puts 1D points on 15-minute boundaries, then a final point at now', () => {
    const window = historyWindow('1d', NOW, null);
    expect(window).toEqual({
      from: new Date('2026-10-07T12:05:00Z'),
      to: NOW,
      stepMs: 15 * MIN,
    });
    const grid = historyGrid(window as NonNullable<typeof window>);
    expect(grid).toHaveLength(97);
    expect(grid[0]?.toISOString()).toBe('2026-10-07T12:15:00.000Z');
    expect(grid.at(-2)?.toISOString()).toBe('2026-10-08T12:00:00.000Z');
    expect(grid.at(-1)).toEqual(NOW);

    const history = buildValueHistory(input());
    expect(history).toMatchObject({
      range: '1d',
      from: '2026-10-07T12:05:00.000Z',
      to: NOW.toISOString(),
      stepMinutes: 15,
    });
    expect(history.points).toHaveLength(97);
  });

  it("doesn't repeat now when it falls on a boundary", () => {
    const onBoundary = new Date('2026-10-08T12:00:00Z');
    const grid = historyGrid({
      from: new Date(onBoundary.getTime() - HOUR),
      to: onBoundary,
      stepMs: 15 * MIN,
    });
    expect(grid.map((t) => t.toISOString().slice(11, 16))).toEqual([
      '11:15',
      '11:30',
      '11:45',
      '12:00',
    ]);
  });

  it('starts "all" at the first sync, with the finest step that keeps it to 200 points', () => {
    const tenDays = historyWindow('all', NOW, new Date('2026-09-28T12:00:00Z'));
    expect(tenDays?.stepMs).toBe(4 * HOUR); // 15 min → 961 points, 1 h → 241, 4 h → 61
    expect(buildValueHistory(input({ range: 'all' }))).toMatchObject({
      from: '2026-10-07T00:00:30.000Z', // the first sync
      stepMinutes: 15, // 36 hours: 145 points
    });
    expect(historyWindow('all', NOW, null)).toBeNull();
  });

  it('is empty for "all" before anything has synced', () => {
    const history = buildValueHistory(
      input({ range: 'all', runs: [], snapshots: [], firstSyncAt: new Map() }),
    );
    expect(history.points).toEqual([]);
    expect(history.additions).toEqual([]);
    expect(Object.values(history.summary).every((v) => v === null)).toBe(true);
  });
});

describe('values', () => {
  it('uses the balances and prices known at each point, counting verified assets only', () => {
    const history = buildValueHistory(input({ walletId: 'main' }));
    expect(valueAt(history, '2026-10-07T12:15:00Z')).toBe('1000.00'); // JUNK isn't counted
    expect(valueAt(history, '2026-10-08T01:00:00Z')).toBe('1100.00'); // the newer price
    expect(valueAt(history, '2026-10-08T12:00:00Z')).toBe('1100.00'); // 12:04's isn't out yet
    expect(history.points.at(-1)).toEqual({
      at: NOW.toISOString(),
      valueUsd: '1200.00',
      incomplete: false,
    });
  });

  it('sums an asset across accounts, then rounds each asset to cents, like the holdings view', () => {
    const runs = [
      ...every15('a-rh', '2026-10-08T12:00:00Z', '2026-10-08T12:00:00Z'),
      ...every15('l-rh', '2026-10-08T12:00:00Z', '2026-10-08T12:00:00Z'),
    ];
    const [main, late] = [runs.slice(0, 1), runs.slice(1)];
    const history = buildValueHistory(
      input({
        runs,
        firstSyncAt: firstSyncs(runs),
        snapshots: [
          ...holding(main, [
            ['a', '1'],
            ['b', '1'],
          ]),
          ...holding(late, [['a', '1']]),
        ],
        prices: [
          price('a', '0.125', '2026-10-08T11:00:00Z'),
          price('b', '0.125', '2026-10-08T11:00:00Z'),
        ],
      }),
    );
    // A: 2 × $0.125 = $0.25. B: $0.125 rounds half-even to $0.12. Not 0.36 (per account), not
    // 0.38 (rounding only the sum).
    expect(history.summary.endUsd).toBe('0.37');
  });

  it('breaks the line where nothing synced', () => {
    const history = buildValueHistory(input({ walletId: 'main' }));
    // The last sync before sleeping finished at 01:45:30; points stay drawn for 35 minutes.
    expect(valueAt(history, '2026-10-08T02:15:00Z')).toBe('1100.00');
    expect(valueAt(history, '2026-10-08T02:30:00Z')).toBeNull();
    expect(valueAt(history, '2026-10-08T05:00:00Z')).toBeNull(); // 05:00's sync ends at 05:00:30
    expect(valueAt(history, '2026-10-08T05:15:00Z')).toBe('1100.00');
  });

  it("has no value before a wallet's first sync", () => {
    const history = buildValueHistory(input({ walletId: 'late' }));
    expect(history.trackedSince).toBe('2026-10-08T06:00:30.000Z');
    expect(valueAt(history, '2026-10-08T06:00:00Z')).toBeNull();
    // 1,000 USDC + 1 ETH at $1,100.
    expect(valueAt(history, '2026-10-08T06:15:00Z')).toBe('2100.00');
    // Both of its chains were there from its first point: nothing was added in this range.
    expect(history.additions).toEqual([]);
    expect(history.summary).toEqual({
      startUsd: '2100.00',
      endUsd: '2200.00',
      highUsd: '2200.00',
      lowUsd: '2100.00',
      changeUsd: '100.00',
      changePct: '0.047619',
    });
  });

  it('flags values resting on a partial sync, and leaves the change out when one ends a range', () => {
    // Main's syncs couldn't see everything until 06:00 on Oct 8 (say, a network not enabled yet).
    const main = every15('a-rh', '2026-10-07T00:00:00Z', '2026-10-08T12:00:00Z', {
      skip: asleep,
      partial: (t) => t < new Date('2026-10-08T06:00:00Z'),
    });
    const history = buildValueHistory(
      input({
        walletId: 'main',
        runs: main,
        firstSyncAt: firstSyncs(main),
        snapshots: holding(main, [['eth', '1']]),
      }),
    );
    const point = (iso: string) => history.points.find((p) => p.at === new Date(iso).toISOString());
    expect(point('2026-10-08T01:00:00Z')).toMatchObject({ valueUsd: '1100.00', incomplete: true });
    expect(point('2026-10-08T06:15:00Z')).toMatchObject({ valueUsd: '1100.00', incomplete: false });
    expect(point('2026-10-08T03:00:00Z')).toMatchObject({ valueUsd: null, incomplete: false });
    // The range starts on an incomplete value, so there's no honest change to show.
    expect(history.summary).toMatchObject({ startUsd: '1000.00', changeUsd: null });
  });

  it('scopes to a venue account, and rejects an unknown wallet', () => {
    const history = buildValueHistory(input({ walletId: 'cb' }));
    expect(history.scope).toEqual({ walletId: 'cb' });
    expect(history.summary.endUsd).toBe('50.00');
    expect(() => buildValueHistory(input({ walletId: 'nope' }))).toThrow('Unknown wallet nope');
  });
});

describe('additions', () => {
  it('marks a wallet added mid-range as one step, and leaves the change out', () => {
    const history = buildValueHistory(input());
    expect(valueAt(history, '2026-10-07T12:15:00Z')).toBe('1050.00'); // Main's ETH + Coinbase
    // Its two chains started within one step: one addition, worth its step at 06:15.
    expect(history.additions).toEqual([
      {
        at: '2026-10-08T06:00:30.000Z',
        walletId: 'late',
        name: 'Late',
        places: ['Ethereum', 'Robinhood Chain'],
        valueUsd: '2100.00',
      },
    ]);
    // 2 ETH × $1,200 + 1,000 USDC + $50.
    expect(history.summary).toMatchObject({
      startUsd: '1050.00',
      endUsd: '3450.00',
      changeUsd: null,
      changePct: null,
    });
  });

  it('names a venue account the way the holdings view does', () => {
    const cb = every15('cb', '2026-10-08T09:00:00Z', '2026-10-08T12:00:00Z');
    const main = every15('a-rh', '2026-10-07T00:00:00Z', '2026-10-08T12:00:00Z');
    const runs = [...main, ...cb];
    const history = buildValueHistory(
      input({
        runs,
        firstSyncAt: firstSyncs(runs),
        snapshots: [...holding(main, [['eth', '1']]), ...holding(cb, [['usd', '50']])],
      }),
    );
    expect(history.additions).toEqual([
      {
        at: '2026-10-08T09:00:30.000Z',
        walletId: 'cb',
        name: 'Coinbase',
        places: ['Coinbase'],
        valueUsd: '50.00',
      },
    ]);
  });
});
