import {
  type AssetRef,
  CHAINS,
  nativeAssetRef,
  parseRawAmount,
  tokenAssetRef,
  VENUE_DECIMALS,
  VENUE_INFO,
  venueAssetRef,
} from '@talewinds/core';
import { addAccount, findAssetByRef, schema, setAssetStatusManually } from '@talewinds/db';
import { createTestDatabase, resetDatabase } from '@talewinds/db/testing';
import type {
  BalanceReading,
  ObservedAsset,
  PriceReading,
  PricingInput,
  Sources,
  VenueBalanceSource,
  VenuePriceSource,
  WalletBalanceSource,
} from '@talewinds/sources';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { portfolioConfig } from './config.ts';
import type { PortfolioDeps } from './deps.ts';
import { getHoldings } from './holdings.ts';
import { syncAllOwnedAccounts } from './sync.ts';
import { addWallet, renameWallet } from './wallets.ts';

const { db, close } = createTestDatabase();
beforeEach(() => resetDatabase(db));
afterAll(() => close());

const RH = CHAINS.robinhood;
const WALLET = '0x00000000000000000000000000000000000000aa';
const REAL = '0x00000000000000000000000000000000000000b1';
const JUNK = '0x00000000000000000000000000000000000000b2';
const SCAM = '0x00000000000000000000000000000000000000b3';

const asset = (address: string | null, symbol: string): ObservedAsset => ({
  ref: address ? tokenAssetRef(RH, address) : nativeAssetRef(RH),
  chainId: RH.id,
  kind: address ? 'token' : 'native',
  address,
  symbol,
  name: symbol,
  decimals: 18,
  decimalsSource: 'test',
  metadataSource: 'test',
  providerVerified: address === null,
});

/** A scripted wallet source: returns `reading()` or throws `failWith`. */
function fakeWallet(reading: () => BalanceReading, failWith?: string): WalletBalanceSource {
  return {
    chainKey: 'robinhood',
    async fetchBalances() {
      if (failWith) throw new Error(failWith);
      return reading();
    },
  };
}

function readingOf(balances: [ObservedAsset, string][], complete = true): BalanceReading {
  return {
    captures: [
      {
        provider: 'fake',
        requestKey: `balances(${WALLET})`,
        payload: { balances: balances.length },
        fetchedAt: new Date(),
      },
    ],
    balances: balances.map(([a, amount]) => ({
      asset: a,
      rawAmount: parseRawAmount(amount, 18),
      captureIndex: 0,
    })),
    notes: complete ? [] : [{ code: 'token_discovery_unavailable', message: 'tokens not visible' }],
    complete,
  };
}

const THIN = '0x00000000000000000000000000000000000000b4';
const ODD = '0x00000000000000000000000000000000000000b5';

interface FakeQuote {
  price: string;
  source: string;
  confidence: 'high' | 'low';
  verifies: boolean;
  liquidity?: string;
  mcap?: string;
  crossCheck?: string;
}

/**
 * Prices per the ADR 0015 policy: ETH (native) and REAL (deep pool, DefiLlama agrees) verify;
 * JUNK/SCAM have only pool prices; THIN has a shallow pool; ODD's sources disagree ~100×.
 */
function fakePrices(): Sources['prices'] {
  return {
    async fetchPrices(inputs: PricingInput[]): Promise<PriceReading> {
      const table: Record<string, FakeQuote> = {
        [nativeAssetRef(RH)]: {
          price: '2000',
          source: 'defillama',
          confidence: 'high',
          verifies: true,
          mcap: '300000000000',
        },
        [tokenAssetRef(RH, REAL)]: {
          price: '1.5',
          source: 'dexscreener',
          confidence: 'high',
          verifies: true,
          liquidity: '1000000',
          mcap: '5000000',
        },
        [tokenAssetRef(RH, JUNK)]: {
          price: '1000',
          source: 'dexscreener',
          confidence: 'low',
          verifies: false,
          liquidity: '500',
        },
        [tokenAssetRef(RH, SCAM)]: {
          price: '5',
          source: 'dexscreener',
          confidence: 'high',
          verifies: false,
          liquidity: '90000',
        },
        [tokenAssetRef(RH, THIN)]: {
          price: '1',
          source: 'dexscreener',
          confidence: 'low',
          verifies: true,
          liquidity: '100',
        },
        [tokenAssetRef(RH, ODD)]: {
          price: '0.0002',
          source: 'dexscreener',
          confidence: 'low',
          verifies: false,
          liquidity: '40000',
          crossCheck: '0.02',
        },
      };
      const quotes = inputs.flatMap((i) => {
        const q = table[i.ref];
        if (!q) return [];
        return [
          {
            ref: i.ref as AssetRef,
            priceUsd: q.price,
            source: q.source,
            confidence: q.confidence,
            pricedAt: new Date(),
            captureIndex: 0,
            marketCapUsd: q.mcap ?? null,
            fdvUsd: null,
            liquidityUsd: q.liquidity ?? null,
            crossCheck: q.crossCheck ? { source: 'defillama', priceUsd: q.crossCheck } : null,
            verifies: q.verifies,
          },
        ];
      });
      return {
        captures: [
          {
            provider: 'fake-prices',
            requestKey: 'prices',
            payload: { n: inputs.length },
            fetchedAt: new Date(),
          },
        ],
        quotes,
        missing: inputs.filter((i) => !table[i.ref]).map((i) => i.ref),
        notes: [],
      };
    },
  };
}

const quietLog = { info() {}, warn() {}, error() {} };

/** Coinbase holdings: 0.85 ETH and $120.50 cash (ADR 0018 venue assets). */
const venueAsset = (code: string): ObservedAsset => ({
  ref: venueAssetRef('coinbase', code),
  chainId: VENUE_INFO.coinbase.chainId,
  kind: 'venue',
  address: null,
  symbol: code,
  name: null,
  decimals: VENUE_DECIMALS,
  decimalsSource: 'venue',
  metadataSource: 'coinbase',
  providerVerified: true,
});

function fakeCoinbase(): VenueBalanceSource {
  return {
    venue: 'coinbase',
    async fetchBalances() {
      return {
        captures: [
          {
            provider: 'fake-coinbase',
            requestKey: 'accounts(page 1)',
            payload: { n: 2 },
            fetchedAt: new Date(),
          },
        ],
        balances: [
          { asset: venueAsset('ETH'), rawAmount: parseRawAmount('0.85', 18), captureIndex: 0 },
          { asset: venueAsset('USD'), rawAmount: parseRawAmount('120.5', 18), captureIndex: 0 },
        ],
        notes: [],
        complete: true,
      };
    },
  };
}

function fakeVenuePrices(): VenuePriceSource {
  const table: Record<string, [string, string]> = {
    ETH: ['2000', 'coinbase'],
    USD: ['1', 'coinbase-rates'],
  };
  return {
    async fetchPrices(inputs): Promise<PriceReading> {
      return {
        captures: [
          {
            provider: 'fake-coinbase-market',
            requestKey: 'market',
            payload: { n: inputs.length },
            fetchedAt: new Date(),
          },
        ],
        quotes: inputs.flatMap((i) => {
          const q = table[i.code];
          if (!q) return [];
          return [
            {
              ref: i.ref,
              priceUsd: q[0],
              source: q[1],
              confidence: 'high' as const,
              pricedAt: new Date(),
              captureIndex: 0,
              marketCapUsd: null,
              fdvUsd: null,
              liquidityUsd: null,
              crossCheck: null,
              verifies: false,
            },
          ];
        }),
        missing: inputs.filter((i) => !table[i.code]).map((i) => i.ref),
        notes: [],
      };
    },
  };
}

function deps(
  wallet: WalletBalanceSource,
  coinbase: VenueBalanceSource | null = null,
): PortfolioDeps {
  const unused = fakeWallet(() => readingOf([]));
  return {
    db,
    config: portfolioConfig(15),
    log: quietLog,
    sources: {
      wallets: { robinhood: wallet, ethereum: unused, solana: unused, bitcoin: unused },
      prices: fakePrices(),
      venueBalances: { coinbase, hyperliquid: null },
      venuePrices: fakeVenuePrices(),
      describe: () => [],
      venues: { coinbase: coinbase !== null, hyperliquid: false },
    },
  };
}

async function ownWallet() {
  await addAccount(db, {
    kind: 'wallet',
    chain: 'robinhood',
    address: WALLET,
    ownership: 'owned',
    label: 'main',
  });
}

describe('portfolio sync → holdings', () => {
  it('stores balances linked to raw records, prices them, and counts only verified assets', async () => {
    await ownWallet();
    const wallet = fakeWallet(() =>
      readingOf([
        [asset(null, 'ETH'), '2'],
        [asset(REAL, 'REAL'), '100'],
        [asset(JUNK, 'JUNK'), '50'],
      ]),
    );
    const result = await syncAllOwnedAccounts(deps(wallet));
    expect(result).toMatchObject({ succeeded: 1, failed: 0, pricesUpdated: 3 });

    const snapshots = await db.select().from(schema.balanceSnapshots);
    expect(snapshots).toHaveLength(3);
    const raw = await db.select().from(schema.rawRecords);
    expect(snapshots.every((s) => raw.some((r) => r.id === s.rawRecordId))).toBe(true);

    const view = await getHoldings({ db, config: portfolioConfig(15) });
    // ETH (native) + REAL (DefiLlama high confidence) are verified: 2×2000 + 100×1.5
    expect(view.totals.valueUsd).toBe('4150.00');
    expect(view.holdings.map((h) => h.symbol)).toEqual(['ETH', 'REAL']);
    // JUNK has only a DexScreener price, so it stays unverified: hidden, estimated, not counted.
    expect(view.hidden).toMatchObject({ count: 1, estimatedValueUsd: '50000.00' });
    // The notice names it, so a real position can't hide inside a count.
    expect(view.hidden.largest.map((h) => [h.symbol, h.valueUsd])).toEqual([['JUNK', '50000.00']]);
    expect(view.accounts[0]).toMatchObject({ stale: false, incomplete: false });
  });

  it('shows hidden assets on request, and excludes manual spam from the hidden estimate', async () => {
    await ownWallet();
    const wallet = fakeWallet(() =>
      readingOf([
        [asset(JUNK, 'JUNK'), '50'],
        [asset(SCAM, 'SCAM'), '10'],
      ]),
    );
    await syncAllOwnedAccounts(deps(wallet));
    const scam = await findAssetByRef(db, tokenAssetRef(RH, SCAM));
    await setAssetStatusManually(db, scam?.id as string, 'spam', 'fake airdrop');

    const view = await getHoldings({ db, config: portfolioConfig(15) }, { includeHidden: true });
    expect(view.holdings.map((h) => [h.symbol, h.status])).toEqual([
      ['JUNK', 'unverified'],
      ['SCAM', 'spam'],
    ]);
    expect(view.hidden).toMatchObject({ count: 2, estimatedValueUsd: '50000.00' });
    // Spam is never suggested as a hidden position worth reviewing.
    expect(view.hidden.largest.map((h) => h.symbol)).toEqual(['JUNK']);
    expect(view.totals.valueUsd).toBe('0.00');
  });

  it('marks accounts incomplete when a sync could not see everything', async () => {
    await ownWallet();
    await syncAllOwnedAccounts(
      deps(fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']], false))),
    );
    const view = await getHoldings({ db, config: portfolioConfig(15) });
    expect(view.accounts[0]).toMatchObject({ incomplete: true });
    expect(view.accounts[0]?.lastRun?.notes[0]?.code).toBe('token_discovery_unavailable');
    expect(view.quality.partialAccounts).toBe(1);
  });

  it('records a failed sync without losing the last good balances', async () => {
    await ownWallet();
    await syncAllOwnedAccounts(deps(fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']]))));
    const failed = await syncAllOwnedAccounts(
      deps(fakeWallet(() => readingOf([]), 'provider down')),
    );
    expect(failed.failed).toBe(1);

    const view = await getHoldings({ db, config: portfolioConfig(15) });
    expect(view.accounts[0]?.lastRun).toMatchObject({ status: 'failed', error: 'provider down' });
    expect(view.holdings.map((h) => h.symbol)).toEqual(['ETH']); // still shows the last good run
    expect(view.quality.failedAccounts).toBe(1);
  });

  it('flags balances as stale once the last good sync is too old', async () => {
    await ownWallet();
    await syncAllOwnedAccounts(deps(fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']]))));
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const view = await getHoldings({ db, config: portfolioConfig(15), now: () => later });
    expect(view.accounts[0]?.stale).toBe(true);
    expect(view.holdings[0]?.price?.stale).toBe(true);
  });
});

describe('wallets', () => {
  it('adds an EVM wallet on every EVM chain, idempotently, and renames it', async () => {
    const first = await addWallet(db, {
      address: WALLET.toUpperCase().replace('0X', '0x'),
      name: 'Degen',
    });
    expect(first.created).toBe(true);
    expect(first.accounts.map((a) => a.chainId).sort()).toEqual(['eip155:1', 'eip155:4663']);
    const again = await addWallet(db, { address: WALLET, name: 'Ignored' });
    expect(again.created).toBe(false);
    expect(again.wallet.name).toBe('Degen'); // adding again never renames
    const renamed = await renameWallet(db, first.wallet.id, '  Main  ');
    expect(renamed.name).toBe('Main');
    expect((await renameWallet(db, first.wallet.id, '')).name).toBeNull();
  });

  it('groups holdings wallet → chain, and lists chains the wallet is not tracked on', async () => {
    await ownWallet(); // Robinhood only
    await syncAllOwnedAccounts(
      deps(
        fakeWallet(() =>
          readingOf([
            [asset(null, 'ETH'), '2'],
            [asset(REAL, 'REAL'), '100'],
          ]),
        ),
      ),
    );
    const view = await getHoldings({ db, config: portfolioConfig(15) });
    expect(view.wallets).toHaveLength(1);
    const w = view.wallets[0];
    expect(w).toMatchObject({ name: 'main', family: 'evm', valueUsd: '4150.00' });
    expect(w?.chains.map((c) => [c.chainName, c.valueUsd])).toEqual([
      ['Robinhood Chain', '4150.00'],
    ]);
    expect(w?.chains[0]?.positions.map((p) => p.symbol)).toEqual(['ETH', 'REAL']);
    expect(w?.untrackedChains.map((c) => c.key)).toEqual(['ethereum']);
    // Market data flows through with its source.
    const real = w?.chains[0]?.positions.find((p) => p.symbol === 'REAL');
    expect(real?.market).toMatchObject({
      marketCapUsd: '5000000',
      liquidityUsd: '1000000',
      source: 'dexscreener',
    });
  });
});

describe('price accuracy', () => {
  it('flags positions worth more than their pool can absorb, and counts them as low confidence', async () => {
    await ownWallet();
    await syncAllOwnedAccounts(
      deps(
        fakeWallet(() =>
          readingOf([
            [asset(REAL, 'REAL'), '100'],
            [asset(THIN, 'THIN'), '50'],
          ]),
        ),
      ),
    );
    const view = await getHoldings({ db, config: portfolioConfig(15) });
    const thin = view.holdings.find((h) => h.symbol === 'THIN');
    expect(thin).toMatchObject({ visible: true, valueUsd: '50.00', illiquid: true }); // $50 > 10% of $100
    expect(view.holdings.find((h) => h.symbol === 'REAL')?.illiquid).toBe(false);
    expect(view.totals).toMatchObject({ illiquidCount: 1, lowConfidenceValueUsd: '50.00' });
  });

  it('never auto-verifies when sources disagree, and shows the disagreement', async () => {
    await ownWallet();
    await syncAllOwnedAccounts(deps(fakeWallet(() => readingOf([[asset(ODD, 'ODD'), '1000']]))));
    const odd = await findAssetByRef(db, tokenAssetRef(RH, ODD));
    expect(odd?.status).toBe('unverified');
    await setAssetStatusManually(db, odd?.id as string, 'verified', 'I hold it deliberately');
    const view = await getHoldings({ db, config: portfolioConfig(15) });
    const h = view.holdings.find((x) => x.symbol === 'ODD');
    expect(h?.price?.crossCheck).toEqual({ source: 'defillama', priceUsd: '0.02' });
    expect(h?.valueUsd).toBe('0.20'); // valued at the on-chain price, not DefiLlama's
    expect(view.totals.disagreementCount).toBe(1);
  });
});

describe('overview', () => {
  it("measures 24h change against the same source's recorded price from a day earlier", async () => {
    await ownWallet();
    await syncAllOwnedAccounts(
      deps(
        fakeWallet(() =>
          readingOf([
            [asset(null, 'ETH'), '2'],
            [asset(REAL, 'REAL'), '100'],
          ]),
        ),
      ),
    );
    const observations = await db.select().from(schema.priceObservations);
    const eth = await findAssetByRef(db, nativeAssetRef(RH));
    const real = await findAssetByRef(db, tokenAssetRef(RH, REAL));
    const latest = observations.find((o) => o.assetId === eth?.id);
    if (!latest || !eth || !real) throw new Error('expected synced prices');
    const dayEarlier = (minutes: number) =>
      new Date(latest.pricedAt.getTime() - 24 * 60 * 60_000 - minutes * 60_000);
    await db.insert(schema.priceObservations).values([
      // ETH: same source (defillama), 5 minutes from the 24-hour mark — the baseline.
      {
        assetId: eth.id,
        priceUsd: '1600',
        source: 'defillama',
        confidence: 'high',
        pricedAt: dayEarlier(5),
        fetchedAt: dayEarlier(5),
        rawRecordId: latest.rawRecordId,
      },
      // REAL: priced by dexscreener now, so a defillama price from a day ago doesn't count.
      {
        assetId: real.id,
        priceUsd: '1',
        source: 'defillama',
        confidence: 'high',
        pricedAt: dayEarlier(0),
        fetchedAt: dayEarlier(0),
        rawRecordId: latest.rawRecordId,
      },
    ]);

    const view = await getHoldings({ db, config: portfolioConfig(15) });
    expect(view.holdings.find((h) => h.symbol === 'ETH')?.change24h).toMatchObject({
      pct: '0.250000',
      usd: '800.00',
      baselineUsd: '1600',
    });
    expect(view.holdings.find((h) => h.symbol === 'REAL')?.change24h).toBeNull();
    expect(view.overview.change24h).toEqual({
      usd: '800.00',
      pct: '0.250000',
      coveredValueUsd: '4000.00',
      uncoveredCount: 1,
    });
  });

  it('scopes holdings to one wallet, and rejects an unknown wallet', async () => {
    await ownWallet();
    await syncAllOwnedAccounts(deps(fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']]))));
    const all = await getHoldings({ db, config: portfolioConfig(15) });
    const walletId = all.walletOptions[0]?.walletId as string;

    const one = await getHoldings({ db, config: portfolioConfig(15) }, { walletId });
    expect(one.scope).toEqual({ walletId });
    expect(one.totals.valueUsd).toBe('2000.00');
    expect(one.overview.byWallet).toEqual([]);
    expect(one.overview.byChain.map((r) => [r.label, r.share])).toEqual([
      ['Robinhood Chain', '1.000000'],
    ]);
    await expect(
      getHoldings(
        { db, config: portfolioConfig(15) },
        { walletId: '01a0e4bb-6c32-76e6-9590-ce717185cfff' },
      ),
    ).rejects.toThrow('Unknown wallet');
  });
});

describe('venues (step 02)', () => {
  const ownCoinbase = () =>
    addAccount(db, { kind: 'venue', venue: 'coinbase', ownership: 'owned', label: 'main' });

  it('syncs Coinbase next to wallets, prices it on Coinbase, and counts it everywhere', async () => {
    await ownWallet();
    await ownCoinbase();
    const result = await syncAllOwnedAccounts(
      deps(
        fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']])),
        fakeCoinbase(),
      ),
    );
    expect(result).toMatchObject({ succeeded: 2, failed: 0 });

    const eth = await findAssetByRef(db, venueAssetRef('coinbase', 'ETH'));
    expect(eth).toMatchObject({ kind: 'venue', address: null, status: 'verified' });

    const config = portfolioConfig(15);
    const view = await getHoldings({ db, config, venues: { coinbase: true } });
    // Wallet: 1 ETH × $2,000. Coinbase: 0.85 ETH × $2,000 + $120.50 cash.
    expect(view.totals.valueUsd).toBe('3820.50');
    const coinbase = view.wallets.find((w) => w.kind === 'venue');
    expect(coinbase).toMatchObject({ name: 'Coinbase', family: 'venue', valueUsd: '1820.50' });
    expect(coinbase?.chains.map((c) => [c.chainName, c.sync.syncSupported])).toEqual([
      ['Coinbase', true],
    ]);
    expect(coinbase?.chains[0]?.positions.map((p) => [p.symbol, p.price?.source])).toEqual([
      ['ETH', 'coinbase'],
      ['USD', 'coinbase-rates'],
    ]);
    expect(view.overview.byWallet.map((r) => [r.label, r.valueUsd])).toEqual([
      ['main', '2000.00'],
      ['Coinbase', '1820.50'],
    ]);
    expect(view.overview.byChain.map((r) => r.label)).toEqual(['Robinhood Chain', 'Coinbase']);
    // One ETH across the wallet and Coinbase (ADR 0019), with each holding visible.
    const ethCoin = view.overview.byCoin.find((r) => r.key === 'eth');
    expect(ethCoin).toMatchObject({ valueUsd: '3700.00', detail: 'Robinhood Chain, Coinbase' });
    expect(ethCoin?.parts?.map((x) => [x.detail, x.valueUsd])).toEqual([
      ['Robinhood Chain', '2000.00'],
      ['Coinbase', '1700.00'],
    ]);
    expect(view.overview.byCoin.find((r) => r.key === 'usd')?.valueUsd).toBe('120.50');

    // Coinbase works as a scope, like a wallet.
    const scoped = await getHoldings(
      { db, config, venues: { coinbase: true } },
      { walletId: coinbase?.walletId as string },
    );
    expect(scoped.totals.valueUsd).toBe('1820.50');
    expect(scoped.wallets.map((w) => w.name)).toEqual(['Coinbase']);
  });

  it('leaves Coinbase unsynced, and says so, until its reader is configured', async () => {
    await ownWallet();
    await ownCoinbase();
    const result = await syncAllOwnedAccounts(
      deps(fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']]))),
    );
    expect(result.accounts.map((a) => a.ref)).toEqual([`${RH.id}:${WALLET}`]);
    const view = await getHoldings({ db, config: portfolioConfig(15) });
    const coinbase = view.wallets.find((w) => w.kind === 'venue');
    expect(coinbase?.chains[0]?.sync).toMatchObject({ syncSupported: false, lastRun: null });
    expect(view.quality.neverSynced).toBe(0); // an unconfigured venue isn't a sync problem
  });
});
