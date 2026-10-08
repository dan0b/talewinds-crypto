import {
  CHAIN_KEYS,
  CHAINS,
  type ChainFamily,
  chainsOfFamily,
  Dec,
  findChainById,
  formatRawAmount,
  type Note,
  rawAmount,
  rawToDec,
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
}

interface Valuation {
  amountRaw: string;
  amount: string;
  price: HoldingPrice | null;
  market: MarketData | null;
  valueUsd: string | null;
  /** Worth more than the configured share of its pool: probably can't be sold at this price. */
  illiquid: boolean;
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

/** One asset across every owned account. */
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
  /** False for account types this version can't sync yet (venues until step 02). */
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
  sync: AccountSyncStatus;
  positions: Position[];
}

export interface WalletGroup {
  walletId: string;
  name: string | null;
  family: string;
  address: string;
  valueUsd: string;
  hiddenCount: number;
  chains: ChainGroup[];
  /** Chains of this wallet's family it isn't tracked on yet (e.g. an EVM wallet not on Ethereum). */
  untrackedChains: { key: string; name: string }[];
}

export interface HoldingsView {
  asOf: string;
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
  };
  /** Wallet → chain → positions (the default view). */
  wallets: WalletGroup[];
  /** Venue accounts (Coinbase, Hyperliquid); balances arrive in step 02. */
  venues: AccountSyncStatus[];
  /** Every asset across all accounts (the by-asset view). */
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
}

const usd = (d: Dec) => d.toFixed(2);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const chainName = (chainId: string) => findChainById(chainId)?.name ?? chainId;
const chainOrder = (chainId: string) => {
  const i = CHAIN_KEYS.findIndex((k) => CHAINS[k].id === chainId);
  return i === -1 ? CHAIN_KEYS.length : i;
};

/** Highest value first; unpriced last, alphabetically. */
function byValue<T extends { valueUsd: string | null; symbol: string | null }>(a: T, b: T): number {
  if (a.valueUsd && b.valueUsd) return new Dec(b.valueUsd).comparedTo(new Dec(a.valueUsd));
  if (a.valueUsd) return -1;
  if (b.valueUsd) return 1;
  return (a.symbol ?? '').localeCompare(b.symbol ?? '');
}

/** Pure: turn stored balances, prices, wallets, and sync state into the holdings view. */
export function buildHoldingsView(input: HoldingsInput): HoldingsView {
  const { now, config } = input;
  const walletById = new Map(input.wallets.map((w) => [w.id, w]));
  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  const labelOf = (a: AccountRow) =>
    a.walletId ? (walletById.get(a.walletId)?.name ?? null) : a.label;

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

  const value = (raw: bigint, decimals: number, assetId: string): Valuation => {
    const { price, market } = priceOf(assetId);
    const v = price ? rawToDec(rawAmount(raw), decimals).times(new Dec(price.usd)) : null;
    const illiquid = Boolean(
      v &&
        market?.liquidityUsd &&
        v.gt(new Dec(market.liquidityUsd).times(config.illiquidShareOfPool)),
    );
    return {
      amountRaw: raw.toString(),
      amount: formatRawAmount(rawAmount(raw), decimals),
      price,
      market,
      valueUsd: v ? usd(v) : null,
      illiquid,
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
  });

  // --- By asset (totals are computed here, once per asset) ---
  const byAsset = new Map<string, CurrentBalanceRow[]>();
  for (const row of input.balances)
    byAsset.set(row.assetId, [...(byAsset.get(row.assetId) ?? []), row]);

  const holdings: Holding[] = [];
  let total = new Dec(0);
  let lowConfidence = new Dec(0);
  let hiddenValue = new Dec(0);
  let hiddenCount = 0;
  let unpriced = 0;
  let stalePrices = 0;
  let disagreements = 0;
  let illiquidCount = 0;

  for (const [assetId, rows] of byAsset) {
    const first = rows[0] as CurrentBalanceRow;
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
        valueUsd: value(raw, first.decimals, assetId).valueUsd,
        observedAt: r.observedAt.toISOString(),
      };
    });
    const fields = assetFields(first);
    const valuation = value(sum, first.decimals, assetId);

    if (fields.visible) {
      if (valuation.valueUsd) {
        const v = new Dec(valuation.valueUsd);
        total = total.plus(v);
        if (valuation.price?.confidence === 'low' || valuation.illiquid)
          lowConfidence = lowConfidence.plus(v);
        if (valuation.price?.stale) stalePrices++;
        if (valuation.price?.crossCheck) disagreements++;
        if (valuation.illiquid) illiquidCount++;
      } else {
        unpriced++;
      }
    } else {
      hiddenCount++;
      if (valuation.valueUsd && fields.status === 'unverified') {
        hiddenValue = hiddenValue.plus(new Dec(valuation.valueUsd));
      }
    }

    if (fields.visible || input.includeHidden)
      holdings.push({ ...fields, ...valuation, accounts: shares });
  }
  holdings.sort(byValue);

  // --- Account sync status ---
  const owned = input.accounts.filter((a) => a.ownership === 'owned');
  const statusOf = (a: AccountRow): AccountSyncStatus => {
    const s = input.syncState.get(a.id);
    const usable = s?.latestUsable ?? null;
    const lastUsableAt = usable?.finishedAt ?? null;
    const syncSupported = a.kind === 'wallet';
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
  for (const row of input.balances) {
    rowsByAccount.set(row.accountId, [...(rowsByAccount.get(row.accountId) ?? []), row]);
  }

  const wallets: WalletGroup[] = [];
  for (const w of input.wallets) {
    const members = owned
      .filter((a) => a.walletId === w.id && a.kind === 'wallet' && a.chainId)
      .sort((a, b) => chainOrder(a.chainId as string) - chainOrder(b.chainId as string));
    if (members.length === 0) continue;

    let walletValue = new Dec(0);
    let walletHidden = 0;
    const chains: ChainGroup[] = members.map((a) => {
      let chainValue = new Dec(0);
      let chainHidden = 0;
      const positions: Position[] = [];
      for (const r of rowsByAccount.get(a.id) ?? []) {
        const fields = assetFields(r);
        const valuation = value(BigInt(r.rawAmount), r.decimals, r.assetId);
        if (fields.visible && valuation.valueUsd)
          chainValue = chainValue.plus(new Dec(valuation.valueUsd));
        if (!fields.visible) chainHidden++;
        if (fields.visible || input.includeHidden)
          positions.push({ ...fields, ...valuation, accountId: a.id });
      }
      positions.sort(byValue);
      walletValue = walletValue.plus(chainValue);
      walletHidden += chainHidden;
      const sync = statusById.get(a.id) as AccountSyncStatus;
      return {
        accountId: a.id,
        chainId: a.chainId as string,
        chainName: chainName(a.chainId as string),
        valueUsd: usd(chainValue),
        hiddenCount: chainHidden,
        sync,
        positions,
      };
    });

    const tracked = new Set(members.map((a) => a.chainId));
    wallets.push({
      walletId: w.id,
      name: w.name,
      family: w.family,
      address: w.address,
      valueUsd: usd(walletValue),
      hiddenCount: walletHidden,
      chains,
      untrackedChains: chainsOfFamily(w.family as ChainFamily)
        .filter((k) => !tracked.has(CHAINS[k].id))
        .map((k) => ({ key: k, name: CHAINS[k].name })),
    });
  }

  const supported = accounts.filter((a) => a.syncSupported);
  return {
    asOf: now.toISOString(),
    totals: {
      valueUsd: usd(total),
      lowConfidenceValueUsd: usd(lowConfidence),
      unpricedCount: unpriced,
      stalePriceCount: stalePrices,
      disagreementCount: disagreements,
      illiquidCount,
    },
    hidden: { count: hiddenCount, estimatedValueUsd: usd(hiddenValue) },
    wallets,
    venues: accounts.filter((a) => a.kind === 'venue'),
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
  deps: { db: Db; config: PortfolioConfig; now?: () => Date },
  options: { includeHidden?: boolean } = {},
): Promise<HoldingsView> {
  const [balances, accounts, wallets] = await Promise.all([
    currentOwnedBalances(deps.db),
    listAccounts(deps.db),
    listWallets(deps.db),
  ]);
  const owned = accounts.filter((a) => a.ownership === 'owned');
  const [prices, syncState] = await Promise.all([
    latestPrices(deps.db, [...new Set(balances.map((b) => b.assetId))]),
    syncStateByAccount(
      deps.db,
      owned.map((a) => a.id),
    ),
  ]);
  return buildHoldingsView({
    balances,
    prices,
    accounts: owned,
    wallets,
    syncState,
    now: deps.now ? deps.now() : new Date(),
    config: deps.config,
    includeHidden: options.includeHidden ?? false,
  });
}
