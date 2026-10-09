import {
  CHAIN_KEYS,
  CHAINS,
  type ChainFamily,
  chainsOfFamily,
  Dec,
  formatRawAmount,
  type Note,
  placeName,
  rawAmount,
  rawToDec,
  UNDERLYINGS,
  underlyingOf,
  VENUE_INFO,
  Venue,
} from '@talewinds/core';
import {
  type AccountRow,
  type AccountSyncState,
  type CurrentBalanceRow,
  currentOwnedBalances,
  type Db,
  type LatestPrice,
  latestPrices,
  listAccounts,
  listWallets,
  type PriceObservationPoint,
  priceObservationsBetween,
  syncStateByAccount,
  type WalletRow,
} from '@talewinds/db';
import type { PortfolioConfig } from './config.ts';

export interface HoldingPrice {
  usd: string;
  source: string;
  confidence: string;
  pricedAt: string;
  stale: boolean;
  /** A second source that disagreed beyond the threshold (ADR 0015). */
  crossCheck: { source: string; priceUsd: string } | null;
}

/** Market data from the price's source, when it provides it. */
export interface MarketData {
  marketCapUsd: string | null;
  fdvUsd: string | null;
  liquidityUsd: string | null;
  source: string;
}

/** How an amount's value moved over ~24 hours at today's quantity (a price move, not P&L). */
export interface PriceChange {
  /** Signed fraction: "0.05" is +5%. */
  pct: string;
  /** Signed USD change of the amount held now. */
  usd: string;
  /** The baseline: our recorded price from the same source about 24 hours earlier. */
  baselineUsd: string;
  baselineAt: string;
}

interface AssetFields {
  assetId: string;
  ref: string;
  chainId: string;
  chainName: string;
  kind: string;
  address: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number;
  status: string;
  statusSource: string;
  /** Shown by default and counted in totals (verified assets only). */
  visible: boolean;
  /**
   * The coin this asset gives exposure to (ADR 0019), and its form. An asset missing from the
   * registry is its own coin (`known: false`, keyed by its ref).
   */
  underlying: { id: string; symbol: string | null; form: string; known: boolean };
}

interface Valuation {
  amountRaw: string;
  amount: string;
  price: HoldingPrice | null;
  market: MarketData | null;
  valueUsd: string | null;
  /** Worth more than the configured share of its pool: probably can't be sold at this price. */
  illiquid: boolean;
  /** Visible, priced, and worth less than the small-balance threshold: folded in lists. */
  small: boolean;
  /** Null without a fresh price or a baseline from about 24 hours earlier. */
  change24h: PriceChange | null;
}

/** One asset in one account. */
export interface Position extends AssetFields, Valuation {
  accountId: string;
}

export interface HoldingShare {
  accountId: string;
  accountLabel: string | null;
  amountRaw: string;
  amount: string;
  valueUsd: string | null;
  observedAt: string;
}

/** One asset across every owned account in scope. */
export interface Holding extends AssetFields, Valuation {
  accounts: HoldingShare[];
}

export interface AccountSyncStatus {
  id: string;
  ref: string;
  /** The wallet's name for wallet accounts; the account label for venues. */
  label: string | null;
  kind: string;
  chainId: string | null;
  chainName: string | null;
  venue: string | null;
  address: string | null;
  walletId: string | null;
  /** False for an account that can't be synced yet (a venue without its reader or key). */
  syncSupported: boolean;
  lastRun: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
    notes: Note[];
  } | null;
  lastUsableAt: string | null;
  /** The balances shown are older than the staleness threshold. */
  stale: boolean;
  /** The balances shown came from a partial run: something wasn't visible. */
  incomplete: boolean;
}

export interface ChainGroup {
  accountId: string;
  chainId: string;
  chainName: string;
  valueUsd: string;
  hiddenCount: number;
  /** Small balances on this chain (folded in the list, included in `valueUsd`). */
  smallCount: number;
  smallValueUsd: string;
  sync: AccountSyncStatus;
  positions: Position[];
}

/**
 * Holdings grouped by where they're held: a wallet (wallet → chain → positions), or a venue
 * account such as Coinbase, which appears as a group with a single section for the venue.
 */
export interface WalletGroup {
  kind: 'wallet' | 'venue';
  /** The wallet's ID, or the venue account's ID. Either one works as a scope. */
  walletId: string;
  name: string | null;
  /** `evm` / `solana` for wallets; `venue` for venue accounts. */
  family: string;
  venue: string | null;
  /** Null for venue accounts. */
  address: string | null;
  valueUsd: string;
  hiddenCount: number;
  smallCount: number;
  smallValueUsd: string;
  chains: ChainGroup[];
  /** Chains of this wallet's family it isn't tracked on yet (e.g. an EVM wallet not on Ethereum). */
  untrackedChains: { key: string; name: string }[];
}

/** A price move summed over several positions. */
export interface ChangeSummary {
  /** Signed USD change of the positions that have a baseline. */
  usd: string;
  /** Signed fraction of their value 24 hours ago; null when none has a baseline. */
  pct: string | null;
  /** Current value of the positions the change covers. */
  coveredValueUsd: string;
  /** Priced positions without a baseline, left out of the change. */
  uncoveredCount: number;
}

/** One holding inside a coin's row: where it sits, and in what form. */
export interface AllocationPart {
  assetId: string;
  label: string | null;
  /** e.g. "Ethereum · wrapped" or "Coinbase". */
  detail: string;
  valueUsd: string;
  share: string;
}

export interface AllocationRow {
  /** `small` is the folded row of small balances. */
  kind: 'asset' | 'coin' | 'wallet' | 'chain' | 'small';
  /** Asset, wallet, or chain ID (`small` for the folded row). */
  key: string;
  /** Symbol, wallet name, or chain name; null when unknown (an unnamed wallet). */
  label: string | null;
  /** A second line: the chain for an asset. */
  detail: string | null;
  valueUsd: string;
  /** Fraction of the scope's priced total: "0.25" is 25%. */
  share: string;
  /** For the small-balances row: how many holdings it folds. */
  count: number | null;
  change24h: ChangeSummary;
  /** For a coin: the holdings that make it up, largest first. */
  parts: AllocationPart[] | null;
}

export interface Overview {
  /** The scope's priced total: what every share is a fraction of. */
  totalUsd: string;
  /** Each exact asset (per chain or venue), largest first; small balances folded at the end. */
  byAsset: AllocationRow[];
  /**
   * Each coin, wherever and however it's held (ETH + WETH + rsETH + ETH at Coinbase), largest
   * first; coins worth less than the small-balance threshold fold into one row (ADR 0019).
   */
  byCoin: AllocationRow[];
  /** Empty when the scope is a single wallet. */
  byWallet: AllocationRow[];
  byChain: AllocationRow[];
  /** Measured by coin, so ETH spread across chains and venues counts as one position. */
  concentration: {
    largest: { key: string; label: string | null; detail: string | null; share: string } | null;
    /** Share of the three largest coins together (all of them, if fewer). */
    top3Share: string | null;
  };
  change24h: ChangeSummary;
  /** Verified holdings without a price: they're in no share. */
  unpricedCount: number;
}

export interface WalletOption {
  kind: 'wallet' | 'venue';
  walletId: string;
  name: string | null;
  family: string;
  valueUsd: string;
}

export interface HoldingsView {
  asOf: string;
  /** What this view covers: every wallet (`walletId: null`), or one. */
  scope: { walletId: string | null };
  /** Every wallet with its total, whatever the scope (for choosing one). */
  walletOptions: WalletOption[];
  totals: {
    /** Visible (verified), priced holdings only. */
    valueUsd: string;
    /** Part of valueUsd resting on low-confidence prices or thin liquidity. */
    lowConfidenceValueUsd: string;
    unpricedCount: number;
    stalePriceCount: number;
    /** Visible holdings whose price sources disagree. */
    disagreementCount: number;
    /** Visible holdings worth more than their pool can absorb. */
    illiquidCount: number;
  };
  hidden: {
    count: number;
    /** Priced value of hidden unverified assets (spam excluded). Not part of the total. */
    estimatedValueUsd: string;
    /** The most valuable hidden unverified assets, so a real position can't hide in a count. */
    largest: { assetId: string; symbol: string | null; chainName: string; valueUsd: string }[];
  };
  /** Holdings under the threshold, folded in lists. Part of the total. */
  small: { count: number; valueUsd: string; thresholdUsd: string };
  overview: Overview;
  /** Wallet → chain → positions (the default view). */
  wallets: WalletGroup[];
  /** Every asset across the accounts in scope (the by-asset view). */
  holdings: Holding[];
  accounts: AccountSyncStatus[];
  quality: {
    staleAccounts: number;
    failedAccounts: number;
    partialAccounts: number;
    neverSynced: number;
  };
}

export interface HoldingsInput {
  balances: CurrentBalanceRow[];
  prices: Map<string, LatestPrice>;
  accounts: AccountRow[];
  wallets: WalletRow[];
  syncState: Map<string, AccountSyncState>;
  now: Date;
  config: PortfolioConfig;
  includeHidden: boolean;
  /** Limit the view to one wallet or venue account; null or absent for all of them. */
  walletId?: string | null;
  /** Venues whose accounts can be synced (their reader and key are configured). */
  venuesEnabled?: Partial<Record<Venue, boolean>>;
  /** Recorded prices around the 24-hour mark (see `baselineWindow`). */
  priceHistory?: PriceObservationPoint[];
}

const DAY_MS = 24 * 60 * 60_000;

/** Fixed-point string, never a negative zero ("-0.00" → "0.00"). */
function fixed(d: Dec, dp: number): string {
  const s = d.toFixed(dp);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}
const usd = (d: Dec) => fixed(d, 2);
const ratio = (d: Dec) => fixed(d, 6);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const chainName = placeName;
const chainOrder = (chainId: string) => {
  const i = CHAIN_KEYS.findIndex((k) => CHAINS[k].id === chainId);
  return i === -1 ? CHAIN_KEYS.length : i;
};

/** The coin an asset counts toward (ADR 0019); unknown assets are their own coin. */
function coinOf(ref: string, symbol: string | null): AssetFields['underlying'] {
  const link = underlyingOf(ref);
  return link
    ? {
        id: link.underlying,
        symbol: UNDERLYINGS[link.underlying].symbol,
        form: link.form,
        known: true,
      }
    : { id: ref, symbol, form: 'native', known: false };
}

/** Highest value first; unpriced last, alphabetically. */
function byValue<T extends { valueUsd: string | null; symbol: string | null }>(a: T, b: T): number {
  if (a.valueUsd && b.valueUsd) return new Dec(b.valueUsd).comparedTo(new Dec(a.valueUsd));
  if (a.valueUsd) return -1;
  if (b.valueUsd) return 1;
  return (a.symbol ?? '').localeCompare(b.symbol ?? '');
}

export interface Baseline {
  priceUsd: string;
  pricedAt: Date;
}

/** The stretch of price history that can hold 24h baselines for prices that are fresh at `now`. */
export function baselineWindow(now: Date, config: PortfolioConfig): { from: Date; to: Date } {
  const mark = now.getTime() - DAY_MS;
  return {
    from: new Date(mark - config.priceStaleAfterMs - config.baselineToleranceMs),
    to: new Date(mark + config.baselineToleranceMs),
  };
}

/**
 * For each asset with a fresh current price: the recorded price from the **same source** nearest
 * to 24 hours before it, if one lies within the tolerance. Sources can disagree with each other,
 * so a change is only ever measured against the same one. Ties go to the older observation.
 */
export function pickBaselines(
  current: Map<string, LatestPrice>,
  history: PriceObservationPoint[],
  now: Date,
  config: PortfolioConfig,
): Map<string, Baseline> {
  const best = new Map<string, { point: PriceObservationPoint; distance: number }>();
  for (const point of history) {
    const price = current.get(point.assetId);
    if (!price || point.source !== price.source) continue;
    if (now.getTime() - price.pricedAt.getTime() > config.priceStaleAfterMs) continue;
    const distance = Math.abs(point.pricedAt.getTime() - (price.pricedAt.getTime() - DAY_MS));
    if (distance > config.baselineToleranceMs) continue;
    const prev = best.get(point.assetId);
    if (
      !prev ||
      distance < prev.distance ||
      (distance === prev.distance && point.pricedAt.getTime() < prev.point.pricedAt.getTime())
    ) {
      best.set(point.assetId, { point, distance });
    }
  }
  return new Map(
    [...best].map(([assetId, { point }]) => [
      assetId,
      { priceUsd: point.priceUsd, pricedAt: point.pricedAt },
    ]),
  );
}

type Changeable = { visible: boolean; valueUsd: string | null; change24h: PriceChange | null };

/** Sum the price moves of visible, priced items. The % is of their value 24 hours ago. */
export function summarizeChange(items: Changeable[]): ChangeSummary {
  let change = new Dec(0);
  let covered = new Dec(0);
  let uncovered = 0;
  for (const item of items) {
    if (!item.visible || !item.valueUsd) continue;
    if (!item.change24h) {
      uncovered++;
      continue;
    }
    change = change.plus(item.change24h.usd);
    covered = covered.plus(item.valueUsd);
  }
  const before = covered.minus(change);
  return {
    usd: usd(change),
    pct: before.gt(0) ? ratio(change.div(before)) : null,
    coveredValueUsd: usd(covered),
    uncoveredCount: uncovered,
  };
}

/** Pure: allocation, concentration, and 24h change for one scope's holdings and wallets. */
export function buildOverview(args: {
  totalUsd: string;
  holdings: Holding[];
  wallets: WalletGroup[];
  /** Include the by-wallet breakdown (the all-wallets scope). */
  includeWallets: boolean;
  unpricedCount: number;
  /** Coins worth less than this (USD) fold into the small-balances row. */
  smallBalanceUsd: string;
}): Overview {
  const total = new Dec(args.totalUsd);
  const shareOf = (value: Dec) => (total.gt(0) ? ratio(value.div(total)) : '0');
  const row = (
    r: Omit<AllocationRow, 'share' | 'valueUsd' | 'count' | 'parts'> & {
      value: Dec;
      count?: number;
      parts?: AllocationPart[];
    },
  ): AllocationRow => ({
    kind: r.kind,
    key: r.key,
    label: r.label,
    detail: r.detail,
    valueUsd: usd(r.value),
    share: shareOf(r.value),
    count: r.count ?? null,
    change24h: r.change24h,
    parts: r.parts ?? null,
  });
  /** A single holding keeps its exact price-based %, not one rebuilt from rounded cents. */
  const changeOf = (holdings: Holding[]) => {
    const summary = summarizeChange(holdings);
    const only = holdings.length === 1 ? holdings[0] : undefined;
    return only?.change24h ? { ...summary, pct: only.change24h.pct } : summary;
  };
  const byLargest = (a: AllocationRow, b: AllocationRow) =>
    new Dec(b.valueUsd).comparedTo(new Dec(a.valueUsd)) ||
    (a.label ?? '').localeCompare(b.label ?? '');

  // By asset: the scope's holdings, small ones folded into a single row.
  const priced = args.holdings.filter((h) => h.visible && h.valueUsd);
  const large = priced.filter((h) => !h.small);
  const small = priced.filter((h) => h.small);
  const byAsset = large.map((h) =>
    row({
      kind: 'asset',
      key: h.assetId,
      label: h.symbol,
      detail: h.chainName,
      value: new Dec(h.valueUsd as string),
      change24h: changeOf([h]),
    }),
  );
  byAsset.sort(byLargest);
  if (small.length > 0) {
    byAsset.push(
      row({
        kind: 'small',
        key: 'small',
        label: null,
        detail: null,
        value: small.reduce((s, h) => s.plus(h.valueUsd as string), new Dec(0)),
        count: small.length,
        change24h: summarizeChange(small),
      }),
    );
  }

  // By coin (ADR 0019): every holding's value counts toward its coin; forms stay visible as parts.
  const coins = new Map<string, { symbol: string | null; holdings: Holding[]; value: Dec }>();
  for (const h of priced) {
    const coin = coins.get(h.underlying.id) ?? {
      symbol: h.underlying.symbol,
      holdings: [],
      value: new Dec(0),
    };
    coin.holdings.push(h);
    coin.value = coin.value.plus(h.valueUsd as string);
    coins.set(h.underlying.id, coin);
  }
  const partDetail = (h: Holding) =>
    h.underlying.form === 'native' || h.underlying.form === 'venue'
      ? h.chainName
      : `${h.chainName} · ${h.underlying.form}`;
  const places = (hs: Holding[]) => {
    const names = [...new Set(hs.map((h) => h.chainName))];
    return names.length > 3
      ? `${names.slice(0, 3).join(', ')} +${names.length - 3}`
      : names.join(', ');
  };
  const smallBelow = new Dec(args.smallBalanceUsd);
  const byCoin: AllocationRow[] = [];
  const smallCoins: Holding[] = [];
  for (const [id, coin] of coins) {
    if (coin.value.lt(smallBelow)) {
      smallCoins.push(...coin.holdings);
      continue;
    }
    byCoin.push(
      row({
        kind: 'coin',
        key: id,
        label: coin.symbol,
        detail: places(coin.holdings),
        value: coin.value,
        change24h: changeOf(coin.holdings),
        parts: coin.holdings.map((h) => ({
          assetId: h.assetId,
          label: h.symbol,
          detail: partDetail(h),
          valueUsd: h.valueUsd as string,
          share: shareOf(new Dec(h.valueUsd as string)),
        })),
      }),
    );
  }
  byCoin.sort(byLargest);
  if (smallCoins.length > 0) {
    byCoin.push(
      row({
        kind: 'small',
        key: 'small',
        label: null,
        detail: null,
        value: smallCoins.reduce((s, h) => s.plus(h.valueUsd as string), new Dec(0)),
        count: smallCoins.length,
        change24h: summarizeChange(smallCoins),
      }),
    );
  }

  const positionsOf = (w: WalletGroup) => w.chains.flatMap((c) => c.positions);
  const byWallet = args.includeWallets
    ? args.wallets
        .map((w) =>
          row({
            kind: 'wallet',
            key: w.walletId,
            label: w.name,
            detail: null,
            value: new Dec(w.valueUsd),
            change24h: summarizeChange(positionsOf(w)),
          }),
        )
        .sort(byLargest)
    : [];

  const chains = new Map<string, { name: string; value: Dec; positions: Position[] }>();
  for (const c of args.wallets.flatMap((w) => w.chains)) {
    const entry = chains.get(c.chainId) ?? {
      name: c.chainName,
      value: new Dec(0),
      positions: [],
    };
    entry.value = entry.value.plus(c.valueUsd);
    entry.positions.push(...c.positions);
    chains.set(c.chainId, entry);
  }
  const byChain = [...chains]
    .map(([chainId, c]) =>
      row({
        kind: 'chain',
        key: chainId,
        label: c.name,
        detail: null,
        value: c.value,
        change24h: summarizeChange(c.positions),
      }),
    )
    .sort(byLargest);

  const named = byCoin.filter((r) => r.kind === 'coin');
  const first = named[0];
  const top3 = named.slice(0, 3).reduce((s, r) => s.plus(r.valueUsd), new Dec(0));
  return {
    totalUsd: args.totalUsd,
    byAsset,
    byCoin,
    byWallet,
    byChain,
    concentration: {
      largest:
        first && total.gt(0)
          ? { key: first.key, label: first.label, detail: first.detail, share: first.share }
          : null,
      top3Share: first && total.gt(0) ? shareOf(top3) : null,
    },
    change24h: summarizeChange(priced),
    unpricedCount: args.unpricedCount,
  };
}

/**
 * Pure: turn stored balances, prices, wallets, and sync state into the holdings view, for all
 * wallets or one (`input.walletId`).
 */
export function buildHoldingsView(input: HoldingsInput): HoldingsView {
  const walletId = input.walletId ?? null;
  const exists =
    input.wallets.some((w) => w.id === walletId) ||
    input.accounts.some((a) => a.kind === 'venue' && a.id === walletId);
  if (walletId && !exists) throw new Error(`Unknown wallet ${walletId}`);
  const baselines = pickBaselines(input.prices, input.priceHistory ?? [], input.now, input.config);
  const all = buildScopedView(input, null, baselines);
  if (!walletId) return all;
  const scoped = buildScopedView(input, walletId, baselines);
  return { ...scoped, walletOptions: all.walletOptions };
}

function buildScopedView(
  input: HoldingsInput,
  walletId: string | null,
  baselines: Map<string, Baseline>,
): HoldingsView {
  const { now, config } = input;
  const walletById = new Map(input.wallets.map((w) => [w.id, w]));
  const labelOf = (a: AccountRow) =>
    a.walletId ? (walletById.get(a.walletId)?.name ?? null) : a.label;

  const inScope = (a: AccountRow) =>
    walletId === null || a.walletId === walletId || (a.kind === 'venue' && a.id === walletId);
  const scopedAccounts = input.accounts.filter(inScope);
  const scopedIds = new Set(scopedAccounts.map((a) => a.id));
  const balances = input.balances.filter((b) => scopedIds.has(b.accountId));
  const scopedWallets =
    walletId === null ? input.wallets : input.wallets.filter((w) => w.id === walletId);
  const accountById = new Map(scopedAccounts.map((a) => [a.id, a]));
  const smallBelow = new Dec(config.smallBalanceUsd);

  const priceOf = (assetId: string): { price: HoldingPrice | null; market: MarketData | null } => {
    const p = input.prices.get(assetId);
    if (!p) return { price: null, market: null };
    return {
      price: {
        usd: p.priceUsd,
        source: p.source,
        confidence: p.confidence,
        pricedAt: p.pricedAt.toISOString(),
        stale: now.getTime() - p.pricedAt.getTime() > config.priceStaleAfterMs,
        crossCheck:
          p.crossCheckSource && p.crossCheckPriceUsd
            ? { source: p.crossCheckSource, priceUsd: p.crossCheckPriceUsd }
            : null,
      },
      market:
        p.marketCapUsd || p.fdvUsd || p.liquidityUsd
          ? {
              marketCapUsd: p.marketCapUsd,
              fdvUsd: p.fdvUsd,
              liquidityUsd: p.liquidityUsd,
              source: p.source,
            }
          : null,
    };
  };

  const value = (raw: bigint, decimals: number, assetId: string, visible: boolean): Valuation => {
    const { price, market } = priceOf(assetId);
    const quantity = rawToDec(rawAmount(raw), decimals);
    const v = price ? quantity.times(new Dec(price.usd)) : null;
    const valueUsd = v ? usd(v) : null;
    const illiquid = Boolean(
      v &&
        market?.liquidityUsd &&
        v.gt(new Dec(market.liquidityUsd).times(config.illiquidShareOfPool)),
    );
    const baseline = baselines.get(assetId);
    const base = baseline ? new Dec(baseline.priceUsd) : null;
    const change24h =
      price && baseline && base?.gt(0)
        ? {
            pct: ratio(new Dec(price.usd).div(base).minus(1)),
            usd: usd(quantity.times(new Dec(price.usd).minus(base))),
            baselineUsd: baseline.priceUsd,
            baselineAt: baseline.pricedAt.toISOString(),
          }
        : null;
    return {
      amountRaw: raw.toString(),
      amount: formatRawAmount(rawAmount(raw), decimals),
      price,
      market,
      valueUsd,
      illiquid,
      small: visible && valueUsd !== null && new Dec(valueUsd).lt(smallBelow),
      change24h,
    };
  };

  const assetFields = (r: CurrentBalanceRow): AssetFields => ({
    assetId: r.assetId,
    ref: r.assetRef,
    chainId: r.chainId,
    chainName: chainName(r.chainId),
    kind: r.kind,
    address: r.address,
    symbol: r.symbol,
    name: r.name,
    decimals: r.decimals,
    status: r.status,
    statusSource: r.statusSource,
    visible: r.status === 'verified',
    underlying: coinOf(r.assetRef, r.symbol),
  });

  // --- By asset (totals are computed here, once per asset) ---
  const byAsset = new Map<string, CurrentBalanceRow[]>();
  for (const row of balances) byAsset.set(row.assetId, [...(byAsset.get(row.assetId) ?? []), row]);

  const holdings: Holding[] = [];
  let total = new Dec(0);
  let lowConfidence = new Dec(0);
  let hiddenValue = new Dec(0);
  let hiddenCount = 0;
  const hiddenPriced: HoldingsView['hidden']['largest'] = [];
  let smallValue = new Dec(0);
  let smallCount = 0;
  let unpriced = 0;
  let stalePrices = 0;
  let disagreements = 0;
  let illiquidCount = 0;

  for (const [assetId, rows] of byAsset) {
    const first = rows[0] as CurrentBalanceRow;
    const fields = assetFields(first);
    let sum = 0n;
    const shares: HoldingShare[] = rows.map((r) => {
      const raw = BigInt(r.rawAmount);
      sum += raw;
      const account = accountById.get(r.accountId);
      return {
        accountId: r.accountId,
        accountLabel: account ? labelOf(account) : null,
        amountRaw: raw.toString(),
        amount: formatRawAmount(rawAmount(raw), first.decimals),
        valueUsd: value(raw, first.decimals, assetId, fields.visible).valueUsd,
        observedAt: r.observedAt.toISOString(),
      };
    });
    const valuation = value(sum, first.decimals, assetId, fields.visible);

    if (fields.visible) {
      if (valuation.valueUsd) {
        const v = new Dec(valuation.valueUsd);
        total = total.plus(v);
        if (valuation.price?.confidence === 'low' || valuation.illiquid)
          lowConfidence = lowConfidence.plus(v);
        if (valuation.price?.stale) stalePrices++;
        if (valuation.price?.crossCheck) disagreements++;
        if (valuation.illiquid) illiquidCount++;
        if (valuation.small) {
          smallCount++;
          smallValue = smallValue.plus(v);
        }
      } else {
        unpriced++;
      }
    } else {
      hiddenCount++;
      if (valuation.valueUsd && fields.status === 'unverified') {
        hiddenValue = hiddenValue.plus(new Dec(valuation.valueUsd));
        hiddenPriced.push({
          assetId,
          symbol: fields.symbol,
          chainName: fields.chainName,
          valueUsd: valuation.valueUsd,
        });
      }
    }

    if (fields.visible || input.includeHidden)
      holdings.push({ ...fields, ...valuation, accounts: shares });
  }
  holdings.sort(byValue);

  // --- Account sync status ---
  const owned = scopedAccounts.filter((a) => a.ownership === 'owned');
  const statusOf = (a: AccountRow): AccountSyncStatus => {
    const s = input.syncState.get(a.id);
    const usable = s?.latestUsable ?? null;
    const lastUsableAt = usable?.finishedAt ?? null;
    const venue = Venue.safeParse(a.venue);
    const syncSupported =
      a.kind === 'wallet' || (venue.success && Boolean(input.venuesEnabled?.[venue.data]));
    return {
      id: a.id,
      ref: a.ref,
      label: labelOf(a),
      kind: a.kind,
      chainId: a.chainId,
      chainName: a.chainId ? chainName(a.chainId) : null,
      venue: a.venue,
      address: a.address,
      walletId: a.walletId,
      syncSupported,
      lastRun: s?.latest
        ? {
            status: s.latest.status,
            startedAt: s.latest.startedAt.toISOString(),
            finishedAt: iso(s.latest.finishedAt),
            error: s.latest.error,
            notes: s.latest.notes,
          }
        : null,
      lastUsableAt: iso(lastUsableAt),
      stale:
        syncSupported &&
        (!lastUsableAt || now.getTime() - lastUsableAt.getTime() > config.balanceStaleAfterMs),
      incomplete: usable?.status === 'partial',
    };
  };
  const accounts = owned.map(statusOf);
  const statusById = new Map(accounts.map((a) => [a.id, a]));

  // --- Wallet → chain → positions ---
  const rowsByAccount = new Map<string, CurrentBalanceRow[]>();
  for (const row of balances) {
    rowsByAccount.set(row.accountId, [...(rowsByAccount.get(row.accountId) ?? []), row]);
  }

  /** One account's section: its positions, value, and hidden/small counts. */
  const sectionOf = (a: AccountRow, chainId: string): ChainGroup => {
    let chainValue = new Dec(0);
    let chainHidden = 0;
    let chainSmall = 0;
    let chainSmallValue = new Dec(0);
    const positions: Position[] = [];
    for (const r of rowsByAccount.get(a.id) ?? []) {
      const fields = assetFields(r);
      const valuation = value(BigInt(r.rawAmount), r.decimals, r.assetId, fields.visible);
      if (fields.visible && valuation.valueUsd) {
        chainValue = chainValue.plus(new Dec(valuation.valueUsd));
        if (valuation.small) {
          chainSmall++;
          chainSmallValue = chainSmallValue.plus(new Dec(valuation.valueUsd));
        }
      }
      if (!fields.visible) chainHidden++;
      if (fields.visible || input.includeHidden)
        positions.push({ ...fields, ...valuation, accountId: a.id });
    }
    positions.sort(byValue);
    return {
      accountId: a.id,
      chainId,
      chainName: chainName(chainId),
      valueUsd: usd(chainValue),
      hiddenCount: chainHidden,
      smallCount: chainSmall,
      smallValueUsd: usd(chainSmallValue),
      sync: statusById.get(a.id) as AccountSyncStatus,
      positions,
    };
  };
  const sum = (chains: ChainGroup[], pick: (c: ChainGroup) => string) =>
    usd(chains.reduce((s, c) => s.plus(pick(c)), new Dec(0)));

  const wallets: WalletGroup[] = [];
  for (const w of scopedWallets) {
    const members = owned
      .filter((a) => a.walletId === w.id && a.kind === 'wallet' && a.chainId)
      .sort((a, b) => chainOrder(a.chainId as string) - chainOrder(b.chainId as string));
    if (members.length === 0) continue;
    const chains = members.map((a) => sectionOf(a, a.chainId as string));
    const tracked = new Set(members.map((a) => a.chainId));
    wallets.push({
      kind: 'wallet',
      walletId: w.id,
      name: w.name,
      family: w.family,
      venue: null,
      address: w.address,
      valueUsd: sum(chains, (c) => c.valueUsd),
      hiddenCount: chains.reduce((n, c) => n + c.hiddenCount, 0),
      smallCount: chains.reduce((n, c) => n + c.smallCount, 0),
      smallValueUsd: sum(chains, (c) => c.smallValueUsd),
      chains,
      untrackedChains: chainsOfFamily(w.family as ChainFamily)
        .filter((k) => !tracked.has(CHAINS[k].id))
        .map((k) => ({ key: k, name: CHAINS[k].name })),
    });
  }

  // Venue accounts (Coinbase): one group each, with a single section for the venue.
  for (const a of owned.filter((x) => x.kind === 'venue')) {
    const venue = Venue.safeParse(a.venue);
    if (!venue.success) continue;
    const info = VENUE_INFO[venue.data];
    const section = sectionOf(a, info.chainId);
    wallets.push({
      kind: 'venue',
      walletId: a.id,
      name: a.label && a.label !== 'main' ? `${info.name} · ${a.label}` : info.name,
      family: 'venue',
      venue: venue.data,
      address: null,
      valueUsd: section.valueUsd,
      hiddenCount: section.hiddenCount,
      smallCount: section.smallCount,
      smallValueUsd: section.smallValueUsd,
      chains: [section],
      untrackedChains: [],
    });
  }

  const supported = accounts.filter((a) => a.syncSupported);
  return {
    asOf: now.toISOString(),
    scope: { walletId },
    walletOptions: wallets.map((w) => ({
      kind: w.kind,
      walletId: w.walletId,
      name: w.name,
      family: w.family,
      valueUsd: w.valueUsd,
    })),
    totals: {
      valueUsd: usd(total),
      lowConfidenceValueUsd: usd(lowConfidence),
      unpricedCount: unpriced,
      stalePriceCount: stalePrices,
      disagreementCount: disagreements,
      illiquidCount,
    },
    hidden: {
      count: hiddenCount,
      estimatedValueUsd: usd(hiddenValue),
      // Worth at least a cent, largest first: the ones that might be real positions.
      largest: hiddenPriced
        .filter((h) => new Dec(h.valueUsd).gte('0.01'))
        .sort((a, b) => new Dec(b.valueUsd).comparedTo(new Dec(a.valueUsd)))
        .slice(0, 3),
    },
    small: { count: smallCount, valueUsd: usd(smallValue), thresholdUsd: config.smallBalanceUsd },
    overview: buildOverview({
      totalUsd: usd(total),
      holdings,
      wallets,
      includeWallets: walletId === null,
      unpricedCount: unpriced,
      smallBalanceUsd: config.smallBalanceUsd,
    }),
    wallets,
    holdings,
    accounts,
    quality: {
      staleAccounts: supported.filter((a) => a.stale && a.lastRun).length,
      failedAccounts: supported.filter((a) => a.lastRun?.status === 'failed').length,
      partialAccounts: supported.filter((a) => a.incomplete).length,
      neverSynced: supported.filter((a) => !a.lastRun).length,
    },
  };
}

/** Load everything the holdings view needs and build it. */
export async function getHoldings(
  deps: {
    db: Db;
    config: PortfolioConfig;
    now?: () => Date;
    /** Which venues can sync (e.g. `sources.venues`); venue accounts show as unsynced otherwise. */
    venues?: Partial<Record<Venue, boolean>>;
  },
  options: { includeHidden?: boolean; walletId?: string | null } = {},
): Promise<HoldingsView> {
  const now = deps.now ? deps.now() : new Date();
  const [balances, accounts, wallets] = await Promise.all([
    currentOwnedBalances(deps.db),
    listAccounts(deps.db),
    listWallets(deps.db),
  ]);
  const owned = accounts.filter((a) => a.ownership === 'owned');
  const assetIds = [...new Set(balances.map((b) => b.assetId))];
  const window = baselineWindow(now, deps.config);
  const [prices, syncState, priceHistory] = await Promise.all([
    latestPrices(deps.db, assetIds),
    syncStateByAccount(
      deps.db,
      owned.map((a) => a.id),
    ),
    priceObservationsBetween(deps.db, assetIds, window.from, window.to),
  ]);
  return buildHoldingsView({
    balances,
    prices,
    accounts: owned,
    wallets,
    syncState,
    now,
    config: deps.config,
    includeHidden: options.includeHidden ?? false,
    walletId: options.walletId ?? null,
    venuesEnabled: deps.venues,
    priceHistory,
  });
}
