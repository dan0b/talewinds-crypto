import {
  type AssetRef,
  CHAINS,
  nativeAssetRef,
  parseRawAmount,
  tokenAssetRef,
} from '@talewinds/core';
import { addAccount, findAssetByRef, schema, setAssetStatusManually } from '@talewinds/db';
import { createTestDatabase, resetDatabase } from '@talewinds/db/testing';
import type {
  BalanceReading,
  ObservedAsset,
  PriceReading,
  PricingInput,
  Sources,
  WalletBalanceSource,
} from '@talewinds/sources';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { portfolioConfig } from './config.ts';
import type { PortfolioDeps } from './deps.ts';
import { getHoldings } from './holdings.ts';
import { syncAllOwnedWallets } from './sync.ts';
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

function deps(wallet: WalletBalanceSource): PortfolioDeps {
  const unused = fakeWallet(() => readingOf([]));
  return {
    db,
    config: portfolioConfig(15),
    log: quietLog,
    sources: {
      wallets: { robinhood: wallet, ethereum: unused, solana: unused },
      prices: fakePrices(),
      describe: () => [],
      venues: { coinbase: false },
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
    const result = await syncAllOwnedWallets(deps(wallet));
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
    expect(view.hidden).toEqual({ count: 1, estimatedValueUsd: '50000.00' });
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
    await syncAllOwnedWallets(deps(wallet));
    const scam = await findAssetByRef(db, tokenAssetRef(RH, SCAM));
    await setAssetStatusManually(db, scam?.id as string, 'spam', 'fake airdrop');

    const view = await getHoldings({ db, config: portfolioConfig(15) }, { includeHidden: true });
    expect(view.holdings.map((h) => [h.symbol, h.status])).toEqual([
      ['JUNK', 'unverified'],
      ['SCAM', 'spam'],
    ]);
    expect(view.hidden).toEqual({ count: 2, estimatedValueUsd: '50000.00' });
    expect(view.totals.valueUsd).toBe('0.00');
  });

  it('marks accounts incomplete when a sync could not see everything', async () => {
    await ownWallet();
    await syncAllOwnedWallets(
      deps(fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']], false))),
    );
    const view = await getHoldings({ db, config: portfolioConfig(15) });
    expect(view.accounts[0]).toMatchObject({ incomplete: true });
    expect(view.accounts[0]?.lastRun?.notes[0]?.code).toBe('token_discovery_unavailable');
    expect(view.quality.partialAccounts).toBe(1);
  });

  it('records a failed sync without losing the last good balances', async () => {
    await ownWallet();
    await syncAllOwnedWallets(deps(fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']]))));
    const failed = await syncAllOwnedWallets(
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
    await syncAllOwnedWallets(deps(fakeWallet(() => readingOf([[asset(null, 'ETH'), '1']]))));
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
    await syncAllOwnedWallets(
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
    await syncAllOwnedWallets(
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
    await syncAllOwnedWallets(deps(fakeWallet(() => readingOf([[asset(ODD, 'ODD'), '1000']]))));
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
