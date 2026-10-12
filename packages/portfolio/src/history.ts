import {
  CHAIN_KEYS,
  CHAINS,
  Dec,
  placeName,
  rawAmount,
  rawToDec,
  VENUE_INFO,
  Venue,
} from '@talewinds/core';
import {
  type AccountRow,
  type Db,
  firstUsableRunAt,
  listAccounts,
  listWallets,
  type PriceObservationPoint,
  pricesPerStep,
  type RunSnapshot,
  snapshotsOfRuns,
  type UsableRun,
  usableRunsPerStep,
  type WalletRow,
} from '@talewinds/db';
import type { PortfolioConfig } from './config.ts';

/** How far back the value chart looks (step 02f). */
export const HISTORY_RANGES = ['1d', '1w', '1m', 'all'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/** The scope's total value at one moment. */
export interface ValuePoint {
  at: string;
  /** USD, a decimal string; null where nothing had synced recently (a gap, never a guess). */
  valueUsd: string | null;
  /**
   * Some of its balances came from a partial sync, one that couldn't see everything (e.g. a chain
   * not yet enabled at the provider), so the value may be too low.
   */
  incomplete: boolean;
}

/**
 * A wallet (or venue account) whose tracking began inside the range. Its arrival is a step up in
 * the line, not a gain.
 */
export interface ValueAddition {
  /** When its first usable sync finished (earliest among the accounts grouped here). */
  at: string;
  /** Wallet ID, or the venue account's ID (the same IDs the page uses as a scope). */
  walletId: string;
  name: string | null;
  /** Chain or venue names of the accounts that started then, e.g. ['Ethereum', 'Robinhood Chain']. */
  places: string[];
  /**
   * Their value at the first grid point that includes them (the size of the step); null if none
   * of it is priced.
   */
  valueUsd: string | null;
}

/** The scope's total value over a range, replayed from stored balances and prices (ADR 0021). */
export interface ValueHistory {
  range: HistoryRange;
  /** What it covers: every wallet (`walletId: null`), or one wallet or venue account. */
  scope: { walletId: string | null };
  from: string;
  to: string;
  /** When the first account in scope first synced: there's no history before it. */
  trackedSince: string | null;
  stepMinutes: number;
  /** Grid points oldest first, then a final point at `to` that equals the holdings total. */
  points: ValuePoint[];
  /** Oldest first. */
  additions: ValueAddition[];
  summary: {
    /** The first point with a value. */
    startUsd: string | null;
    /** The final point. */
    endUsd: string | null;
    /** Over the points with a value. */
    highUsd: string | null;
    lowUsd: string | null;
    /**
     * End minus start; null when a wallet was added in the range, when the start or the end is
     * incomplete, or with under two values.
     */
    changeUsd: string | null;
    /** The change as a fraction of the start ("0.050000" is +5%); null likewise, or from zero. */
    changePct: string | null;
  };
}

export interface ValueHistoryInput {
  range: HistoryRange;
  now: Date;
  config: PortfolioConfig;
  /** One wallet or venue account; null or absent for all of them. */
  walletId?: string | null;
  accounts: AccountRow[];
  wallets: WalletRow[];
  /** When each account's first usable run finished. */
  firstSyncAt: Map<string, Date>;
  /**
   * Usable runs: per account, at least its newest (by start) in each grid step and its newest
   * before the range (see `usableRunsPerStep`). Extra runs don't change the result.
   */
  runs: UsableRun[];
  /** The balances those runs recorded. */
  snapshots: RunSnapshot[];
  /** Prices: per asset, at least its newest in each grid step and its newest before the range. */
  prices: PriceObservationPoint[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const FIXED_RANGES: Record<Exclude<HistoryRange, 'all'>, { spanMs: number; stepMs: number }> = {
  '1d': { spanMs: DAY, stepMs: 15 * MINUTE },
  '1w': { spanMs: 7 * DAY, stepMs: HOUR },
  '1m': { spanMs: 30 * DAY, stepMs: 4 * HOUR },
};
/** Steps "all" can use, finest first: it takes the finest that keeps the grid within MAX_POINTS. */
const ALL_STEPS = [15 * MINUTE, HOUR, 4 * HOUR, 12 * HOUR, DAY, 7 * DAY];
const MAX_POINTS = 200;

export interface HistoryWindow {
  from: Date;
  to: Date;
  stepMs: number;
}

/** Grid boundaries (multiples of the step since the Unix epoch) in (from, to]. */
const boundariesIn = (from: Date, to: Date, stepMs: number) =>
  Math.floor(to.getTime() / stepMs) - Math.floor(from.getTime() / stepMs);

/**
 * What a range covers and its grid step. "all" starts when the first account in scope first
 * synced, and is null when none has.
 */
export function historyWindow(
  range: HistoryRange,
  now: Date,
  firstSyncAt: Date | null,
): HistoryWindow | null {
  if (range !== 'all') {
    const { spanMs, stepMs } = FIXED_RANGES[range];
    return { from: new Date(now.getTime() - spanMs), to: now, stepMs };
  }
  if (!firstSyncAt) return null;
  const from = firstSyncAt.getTime() < now.getTime() ? firstSyncAt : now;
  const stepMs =
    ALL_STEPS.find((s) => boundariesIn(from, now, s) <= MAX_POINTS) ?? (ALL_STEPS.at(-1) as number);
  return { from, to: now, stepMs };
}

/** The times a history has points at: the step boundaries in (from, to], then `to` itself. */
export function historyGrid({ from, to, stepMs }: HistoryWindow): Date[] {
  const times: Date[] = [];
  for (let k = Math.floor(from.getTime() / stepMs) + 1; k * stepMs <= to.getTime(); k++) {
    times.push(new Date(k * stepMs));
  }
  if (times.at(-1)?.getTime() !== to.getTime()) times.push(to);
  return times;
}

/**
 * The owned accounts a history covers: all of them, one wallet's, or one venue account. Throws
 * `Unknown wallet …` like the holdings view.
 */
export function historyScope(
  accounts: AccountRow[],
  wallets: WalletRow[],
  walletId: string | null,
): AccountRow[] {
  const owned = accounts.filter((a) => a.ownership === 'owned');
  if (walletId === null) return owned;
  const exists =
    wallets.some((w) => w.id === walletId) ||
    owned.some((a) => a.kind === 'venue' && a.id === walletId);
  if (!exists) throw new Error(`Unknown wallet ${walletId}`);
  return owned.filter((a) => a.walletId === walletId || (a.kind === 'venue' && a.id === walletId));
}

/** The earliest first sync among these accounts. */
function earliestSync(accounts: AccountRow[], firstSyncAt: Map<string, Date>): Date | null {
  let earliest: Date | null = null;
  for (const a of accounts) {
    const at = firstSyncAt.get(a.id);
    if (at && (!earliest || at.getTime() < earliest.getTime())) earliest = at;
  }
  return earliest;
}

/** Fixed-point string, never a negative zero ("-0.00" → "0.00"). Same as the holdings view. */
function fixed(d: Dec, dp: number): string {
  const s = d.toFixed(dp);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}
const usd = (d: Dec) => fixed(d, 2);
const ratio = (d: Dec) => fixed(d, 6);

/** Index of the last entry at or before `t` in an ascending list, or -1. */
function lastAtOrBefore(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] as number) <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** A wallet's name, or a venue account's ("Coinbase", "Coinbase · trading"), as holdings names them. */
function groupName(a: AccountRow, walletById: Map<string, WalletRow>): string | null {
  if (a.kind === 'venue') {
    const venue = Venue.safeParse(a.venue);
    if (!venue.success) return a.label;
    const info = VENUE_INFO[venue.data];
    return a.label && a.label !== 'main' ? `${info.name} · ${a.label}` : info.name;
  }
  return a.walletId ? (walletById.get(a.walletId)?.name ?? null) : a.label;
}

/** The chain or venue an account is on. */
function placeOf(a: AccountRow): string {
  const venue = Venue.safeParse(a.venue);
  if (a.kind === 'venue' && venue.success) return VENUE_INFO[venue.data].name;
  return a.chainId ? placeName(a.chainId) : 'Unknown';
}

const chainOrder = (a: AccountRow) => {
  const i = CHAIN_KEYS.findIndex((k) => CHAINS[k].id === a.chainId);
  return i === -1 ? CHAIN_KEYS.length : i;
};

const EMPTY_SUMMARY: ValueHistory['summary'] = {
  startUsd: null,
  endUsd: null,
  highUsd: null,
  lowUsd: null,
  changeUsd: null,
  changePct: null,
};

/**
 * Pure: the scope's value at every grid time, as the holdings view would have shown it then. Each
 * account's newest usable balances known at that time, times each asset's newest price at that
 * time, counting the assets that are verified now (ADR 0021). The final point uses the newest
 * balances and prices, exactly like the holdings total.
 */
export function buildValueHistory(input: ValueHistoryInput): ValueHistory {
  const walletId = input.walletId ?? null;
  const scope = historyScope(input.accounts, input.wallets, walletId);
  const firstSync = earliestSync(scope, input.firstSyncAt);
  const trackedSince = firstSync ? firstSync.toISOString() : null;
  const window = historyWindow(input.range, input.now, firstSync);
  if (!window) {
    const now = input.now.toISOString();
    return {
      range: input.range,
      scope: { walletId },
      from: now,
      to: now,
      trackedSince,
      stepMinutes: (ALL_STEPS[0] as number) / MINUTE,
      points: [],
      additions: [],
      summary: EMPTY_SUMMARY,
    };
  }

  // Per account: its runs in the order they became known, and the newest-started run so far.
  const inScope = new Set(scope.map((a) => a.id));
  const timelines = new Map<string, { knownAt: number[]; newest: UsableRun[] }>();
  const runs = input.runs
    .filter((r) => inScope.has(r.accountId))
    .sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime());
  for (const run of runs) {
    const line = timelines.get(run.accountId) ?? { knownAt: [], newest: [] };
    const prev = line.newest.at(-1);
    line.knownAt.push(run.finishedAt.getTime());
    line.newest.push(prev && prev.startedAt.getTime() >= run.startedAt.getTime() ? prev : run);
    timelines.set(run.accountId, line);
  }

  const snapshotsByRun = new Map<string, RunSnapshot[]>();
  for (const s of input.snapshots) {
    snapshotsByRun.set(s.syncRunId, [...(snapshotsByRun.get(s.syncRunId) ?? []), s]);
  }

  const pricesByAsset = new Map<string, { at: number[]; usd: string[] }>();
  for (const p of [...input.prices].sort((a, b) => a.pricedAt.getTime() - b.pricedAt.getTime())) {
    const line = pricesByAsset.get(p.assetId) ?? { at: [], usd: [] };
    line.at.push(p.pricedAt.getTime());
    line.usd.push(p.priceUsd);
    pricesByAsset.set(p.assetId, line);
  }

  /** The run whose balances count at `t`: the newest-started among those finished by then. */
  const runAt = (accountId: string, t: number): UsableRun | null => {
    const line = timelines.get(accountId);
    const i = line ? lastAtOrBefore(line.knownAt, t) : -1;
    return i === -1 ? null : ((line?.newest[i] as UsableRun | undefined) ?? null);
  };
  /** Whether the account finished a usable sync within `freshFor` before `t`. */
  const freshFor = Math.max(window.stepMs, input.config.balanceStaleAfterMs);
  const syncedRecently = (accountId: string, t: number): boolean => {
    const line = timelines.get(accountId);
    const i = line ? lastAtOrBefore(line.knownAt, t) : -1;
    return i !== -1 && t - (line?.knownAt[i] as number) < freshFor;
  };
  /** The newest price at `t`, or simply the newest one (for the final point, like the live view). */
  const priceAt = (assetId: string, t: number, newest: boolean): string | null => {
    const line = pricesByAsset.get(assetId);
    if (!line) return null;
    const i = newest ? line.at.length - 1 : lastAtOrBefore(line.at, t);
    return i === -1 ? null : (line.usd[i] ?? null);
  };

  /**
   * Value of these accounts at `t`, rounded like the holdings view: raw amounts summed per asset
   * across accounts, valued, rounded to cents, then added up. Unverified and unpriced assets don't
   * count.
   */
  const valueAt = (accounts: AccountRow[], t: number, newest: boolean) => {
    const held = new Map<string, { raw: bigint; decimals: number }>();
    let tracked = false;
    let partial = false;
    for (const a of accounts) {
      const run = runAt(a.id, t);
      if (!run) continue;
      tracked = true;
      if (run.status === 'partial') partial = true;
      for (const s of snapshotsByRun.get(run.id) ?? []) {
        if (s.status !== 'verified') continue;
        const entry = held.get(s.assetId) ?? { raw: 0n, decimals: s.decimals };
        entry.raw += BigInt(s.rawAmount);
        held.set(s.assetId, entry);
      }
    }
    let value = new Dec(0);
    let priced = false;
    for (const [assetId, { raw, decimals }] of held) {
      const price = priceAt(assetId, t, newest);
      if (price === null) continue;
      priced = true;
      value = value.plus(usd(rawToDec(rawAmount(raw), decimals).times(new Dec(price))));
    }
    return { tracked, priced, value, partial };
  };

  const grid = historyGrid(window);
  const last = grid.length - 1;
  const points: ValuePoint[] = grid.map((time, i) => {
    const t = time.getTime();
    const at = time.toISOString();
    const final = i === last;
    const v = valueAt(scope, t, final);
    // Before tracking began, or while nothing synced (the laptop asleep): a gap. The final point
    // always shows the current total, stale or not, like the holdings view.
    if (!v.tracked || (!final && !scope.some((a) => syncedRecently(a.id, t))))
      return { at, valueUsd: null, incomplete: false };
    return { at, valueUsd: usd(v.value), incomplete: v.partial };
  });

  // Accounts whose first sync came after the first point with a value: the range shows a time
  // without them, so their arrival is a step. One addition per wallet per grid step.
  const firstShown = points.find((p) => p.valueUsd !== null);
  const groups = new Map<
    string,
    { walletId: string; accounts: AccountRow[]; at: number; index: number }
  >();
  if (firstShown) {
    const shownAt = Date.parse(firstShown.at);
    for (const a of scope) {
      const first = input.firstSyncAt.get(a.id)?.getTime();
      if (first === undefined || first <= shownAt || first > window.to.getTime()) continue;
      const index = grid.findIndex((g) => g.getTime() >= first);
      if (index === -1) continue;
      const groupId = a.kind === 'venue' ? a.id : (a.walletId ?? a.id);
      const key = `${groupId}|${index}`;
      const group = groups.get(key) ?? { walletId: groupId, accounts: [], at: first, index };
      group.accounts.push(a);
      group.at = Math.min(group.at, first);
      groups.set(key, group);
    }
  }
  const walletById = new Map(input.wallets.map((w) => [w.id, w]));
  const additions: ValueAddition[] = [...groups.values()]
    .sort((a, b) => a.at - b.at)
    .map((g) => {
      const accounts = [...g.accounts].sort((a, b) => chainOrder(a) - chainOrder(b));
      const v = valueAt(accounts, (grid[g.index] as Date).getTime(), g.index === last);
      return {
        at: new Date(g.at).toISOString(),
        walletId: g.walletId,
        name: groupName(accounts[0] as AccountRow, walletById),
        places: [...new Set(accounts.map(placeOf))],
        valueUsd: v.priced ? usd(v.value) : null,
      };
    });

  const drawn = points.filter((p) => p.valueUsd !== null);
  const values = drawn.map((p) => new Dec(p.valueUsd as string));
  const start = values[0];
  const end = points.at(-1);
  const endUsd = end?.valueUsd ?? null;
  // A change only means something between two complete values, with the same wallets.
  const comparable =
    values.length >= 2 && additions.length === 0 && !drawn[0]?.incomplete && !end?.incomplete;
  const change = start && endUsd !== null && comparable ? new Dec(endUsd).minus(start) : null;
  return {
    range: input.range,
    scope: { walletId },
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    trackedSince,
    stepMinutes: window.stepMs / MINUTE,
    points,
    additions,
    summary: {
      startUsd: start ? usd(start) : null,
      endUsd,
      highUsd: start ? usd(values.reduce((m, d) => (d.gt(m) ? d : m))) : null,
      lowUsd: start ? usd(values.reduce((m, d) => (d.lt(m) ? d : m))) : null,
      changeUsd: change ? usd(change) : null,
      changePct: change && start?.gt(0) ? ratio(change.div(start)) : null,
    },
  };
}

/** Load what a range's grid needs, then replay it (`buildValueHistory`). */
export async function getValueHistory(
  deps: { db: Db; config: PortfolioConfig; now?: () => Date },
  options: { range: HistoryRange; walletId?: string | null },
): Promise<ValueHistory> {
  const now = deps.now ? deps.now() : new Date();
  const walletId = options.walletId ?? null;
  const [accounts, wallets] = await Promise.all([listAccounts(deps.db), listWallets(deps.db)]);
  const scope = historyScope(accounts, wallets, walletId);
  const ids = scope.map((a) => a.id);
  const firstSyncAt = await firstUsableRunAt(deps.db, ids);
  const window = historyWindow(options.range, now, earliestSync(scope, firstSyncAt));

  let runs: UsableRun[] = [];
  let snapshots: RunSnapshot[] = [];
  let prices: PriceObservationPoint[] = [];
  if (window && ids.length > 0) {
    runs = await usableRunsPerStep(deps.db, ids, window.from, window.to, window.stepMs);
    snapshots = await snapshotsOfRuns(
      deps.db,
      runs.map((r) => r.id),
    );
    const verified = [
      ...new Set(snapshots.filter((s) => s.status === 'verified').map((s) => s.assetId)),
    ];
    prices = await pricesPerStep(deps.db, verified, window.from, window.stepMs);
  }
  return buildValueHistory({
    range: options.range,
    now,
    config: deps.config,
    walletId,
    accounts,
    wallets,
    firstSyncAt,
    runs,
    snapshots,
    prices,
  });
}
