import { CHAINS } from '@talewinds/core';
import type {
  AccountRow,
  AccountSyncState,
  CurrentBalanceRow,
  LatestPrice,
  PriceObservationPoint,
  WalletRow,
} from '@talewinds/db';
import { describe, expect, it } from 'vitest';
import { portfolioConfig } from './config.ts';
import {
  buildHoldingsView,
  type HoldingsInput,
  pickBaselines,
  summarizeChange,
} from './holdings.ts';

const NOW = new Date('2026-10-08T12:00:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const PRICED_AT = new Date(NOW.getTime() - 5 * MIN);
const config = portfolioConfig(15);

const RH = CHAINS.robinhood.id;
const SOL = CHAINS.solana.id;

const wallet = (id: string, family: string, name: string): WalletRow => ({
  id,
  family,
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

/** A balance of `amount` whole units (decimals 0 keeps the arithmetic readable). */
const balance = (
  accountId: string,
  assetId: string,
  chainId: string,
  symbol: string,
  amount: string,
  status = 'verified',
  ref = `${chainId}/token:${assetId}`,
): CurrentBalanceRow => ({
  accountId,
  assetId,
  assetRef: ref,
  chainId,
  kind: 'token',
  address: assetId,
  symbol,
  name: symbol,
  decimals: 0,
  status,
  statusSource: 'auto',
  rawAmount: amount,
  observedAt: NOW,
  rawRecordId: 'raw',
});

const price = (assetId: string, usd: string, source = 'jupiter'): [string, LatestPrice] => [
  assetId,
  {
    assetId,
    priceUsd: usd,
    source,
    confidence: 'high',
    pricedAt: PRICED_AT,
    marketCapUsd: null,
    fdvUsd: null,
    liquidityUsd: null,
    crossCheckSource: null,
    crossCheckPriceUsd: null,
  },
];

const synced = (accountId: string): [string, AccountSyncState] => {
  const run = {
    id: `run-${accountId}`,
    accountId,
    kind: 'balances',
    status: 'succeeded',
    startedAt: NOW,
    finishedAt: NOW,
    error: null,
    notes: [],
    requestCount: 0,
  };
  return [accountId, { accountId, latest: run, latestUsable: run }];
};

/**
 * Wallet "main" (EVM, Robinhood Chain): ETH $1,000 and X $2 (small).
 * Wallet "memes" (Solana): SOL $300, MEME $100, DUST $0.50 (small), JUNK (unverified, hidden),
 * and UNP (verified, no price). Total: $1,402.50.
 */
function input(overrides: Partial<HoldingsInput> = {}): HoldingsInput {
  return {
    balances: [
      balance('a-rh', 'eth', RH, 'ETH', '5'),
      balance('a-rh', 'x', RH, 'X', '100'),
      balance('b-sol', 'sol', SOL, 'SOL', '2'),
      balance('b-sol', 'meme', SOL, 'MEME', '1000000'),
      balance('b-sol', 'dust', SOL, 'DUST', '1'),
      balance('b-sol', 'junk', SOL, 'JUNK', '1000', 'unverified'),
      balance('b-sol', 'unp', SOL, 'UNP', '7'),
    ],
    prices: new Map([
      price('eth', '200', 'defillama'),
      price('x', '0.02'),
      price('sol', '150', 'defillama'),
      price('meme', '0.0001'),
      price('dust', '0.5'),
      price('junk', '1'),
    ]),
    accounts: [account('a-rh', 'main', RH), account('b-sol', 'memes', SOL)],
    wallets: [wallet('main', 'evm', 'Main'), wallet('memes', 'solana', 'Memes')],
    syncState: new Map([synced('a-rh'), synced('b-sol')]),
    now: NOW,
    config,
    includeHidden: false,
    ...overrides,
  };
}

const at = (msBeforeMark: number) => new Date(PRICED_AT.getTime() - 24 * HOUR - msBeforeMark);
const point = (
  assetId: string,
  priceUsd: string,
  pricedAt: Date,
  source = 'jupiter',
): PriceObservationPoint => ({ assetId, priceUsd, source, pricedAt });

describe('small balances', () => {
  it('flags visible, priced holdings under the threshold and keeps them in totals', () => {
    const view = buildHoldingsView(input());
    expect(view.totals.valueUsd).toBe('1402.50');
    expect(view.small).toEqual({ count: 2, valueUsd: '2.50', thresholdUsd: '3' });

    const small = view.holdings.filter((h) => h.small).map((h) => h.symbol);
    expect(small).toEqual(['X', 'DUST']);
    // Unpriced is never small (its value is unknown); hidden JUNK isn't in the list at all.
    expect(view.holdings.find((h) => h.symbol === 'UNP')?.small).toBe(false);

    const [main, memes] = view.wallets;
    expect(main?.chains[0]).toMatchObject({ smallCount: 1, smallValueUsd: '2.00' });
    expect(memes).toMatchObject({ valueUsd: '400.50', smallCount: 1, smallValueUsd: '0.50' });
  });

  it('follows the configured threshold', () => {
    const view = buildHoldingsView(
      input({ config: portfolioConfig(15, { smallBalanceUsd: '150' }) }),
    );
    expect(view.holdings.filter((h) => h.small).map((h) => h.symbol)).toEqual([
      'MEME',
      'X',
      'DUST',
    ]);
  });
});

describe('overview', () => {
  it('breaks the total down by asset, folding small balances into one row', () => {
    const { overview } = buildHoldingsView(input());
    expect(overview.byAsset.map((r) => [r.kind, r.label, r.valueUsd, r.share, r.count])).toEqual([
      ['asset', 'ETH', '1000.00', '0.713012', null],
      ['asset', 'SOL', '300.00', '0.213904', null],
      ['asset', 'MEME', '100.00', '0.071301', null],
      ['small', null, '2.50', '0.001783', 2],
    ]);
    const sum = overview.byAsset.reduce((s, r) => s + Number(r.share), 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(overview.unpricedCount).toBe(1);
  });

  it('breaks the total down by wallet and by chain', () => {
    const { overview } = buildHoldingsView(input());
    expect(overview.byWallet.map((r) => [r.label, r.valueUsd, r.share])).toEqual([
      ['Main', '1002.00', '0.714439'],
      ['Memes', '400.50', '0.285561'],
    ]);
    expect(overview.byChain.map((r) => [r.label, r.valueUsd])).toEqual([
      ['Robinhood Chain', '1002.00'],
      ['Solana', '400.50'],
    ]);
  });

  it('reports concentration by coin', () => {
    const { overview } = buildHoldingsView(input());
    // These test assets aren't in the registry, so each is its own coin (keyed by its ref).
    expect(overview.concentration).toEqual({
      largest: {
        key: `${RH}/token:eth`,
        label: 'ETH',
        detail: 'Robinhood Chain',
        share: '0.713012',
      },
      top3Share: '0.998217',
    });
  });

  it('counts every form of a coin toward it, by value, and keeps each form visible', () => {
    const ETH_MAINNET = CHAINS.ethereum.id;
    const WETH = `${ETH_MAINNET}/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`;
    const view = buildHoldingsView(
      input({
        balances: [
          balance('a-rh', 'eth-rh', RH, 'ETH', '5', 'verified', `${RH}/slip44:60`),
          balance(
            'a-eth',
            'eth-l1',
            ETH_MAINNET,
            'ETH',
            '1',
            'verified',
            `${ETH_MAINNET}/slip44:60`,
          ),
          balance('a-eth', 'weth', ETH_MAINNET, 'WETH', '2', 'verified', WETH),
          balance('b-sol', 'sol', SOL, 'SOL', '2'),
        ],
        prices: new Map([
          price('eth-rh', '200', 'defillama'),
          price('eth-l1', '200', 'defillama'),
          price('weth', '201', 'dexscreener'),
          price('sol', '150', 'defillama'),
        ]),
        accounts: [
          account('a-rh', 'main', RH),
          account('a-eth', 'main', ETH_MAINNET),
          account('b-sol', 'memes', SOL),
        ],
        syncState: new Map([synced('a-rh'), synced('a-eth'), synced('b-sol')]),
      }),
    );
    const eth = view.overview.byCoin[0];
    // $1,000 + $200 + $402 (two WETH at $201): values add up, amounts never do.
    expect(eth).toMatchObject({
      kind: 'coin',
      key: 'eth',
      label: 'ETH',
      valueUsd: '1602.00',
      detail: 'Robinhood Chain, Ethereum',
    });
    // It opens to its holdings, with shares of the coin and of the total.
    expect(
      eth?.breakdown?.map((p) => [p.kind, p.label, p.detail, p.valueUsd, p.share, p.totalShare]),
    ).toEqual([
      ['holding', 'ETH', 'Robinhood Chain', '1000.00', '0.624220', '0.525762'],
      ['holding', 'WETH', 'Ethereum · wrapped', '402.00', '0.250936', '0.211356'],
      ['holding', 'ETH', 'Ethereum', '200.00', '0.124844', '0.105152'],
    ]);
    // A coin held in one form and place has nothing to open.
    expect(view.overview.byCoin.find((r) => r.label === 'SOL')?.breakdown).toBeNull();
    // $1,602 of $1,902 (with SOL's $300).
    expect(view.overview.concentration.largest).toMatchObject({ key: 'eth', share: '0.842271' });
    // By exact asset, the three ETH holdings stay separate.
    expect(view.overview.byAsset.filter((r) => r.label === 'ETH')).toHaveLength(2);
  });

  it('gives every coin its own row, down to 0.1% of the total', () => {
    const { overview } = buildHoldingsView(input());
    // DUST ($0.50) is under 0.1% of $1,402.50, but a single row never folds on its own.
    expect(overview.otherBelowShare).toBe('0.001');
    expect(overview.byCoin.map((r) => [r.kind, r.label, r.share])).toEqual([
      ['coin', 'ETH', '0.713012'],
      ['coin', 'SOL', '0.213904'],
      ['coin', 'MEME', '0.071301'],
      ['coin', 'X', '0.001426'],
      ['coin', 'DUST', '0.000357'],
    ]);
  });

  it('folds rows under the threshold into Other, which opens to list them', () => {
    const { overview } = buildHoldingsView(
      input({ config: { ...config, allocationOtherBelowShare: '0.01' } }),
    );
    const other = overview.byCoin.at(-1);
    expect(other).toMatchObject({
      kind: 'other',
      key: 'other',
      label: null,
      detail: 'X, DUST',
      valueUsd: '2.50',
      share: '0.001783',
      count: 2,
    });
    expect(other?.breakdown?.map((r) => [r.label, r.valueUsd, r.share, r.totalShare])).toEqual([
      ['X', '2.00', '0.800000', '0.001426'],
      ['DUST', '0.50', '0.200000', '0.000357'],
    ]);
    expect(overview.byCoin.map((r) => r.label)).toEqual(['ETH', 'SOL', 'MEME', null]);
    // Concentration still counts coins, not the Other row.
    expect(overview.concentration.largest?.label).toBe('ETH');
  });

  it('never folds every row into Other', () => {
    const { overview } = buildHoldingsView(
      input({ config: { ...config, allocationOtherBelowShare: '1' } }),
    );
    expect(overview.byCoin.some((r) => r.kind === 'other')).toBe(false);
  });

  it('opens wallets and chains to the coins they hold, with shares of the group', () => {
    const { overview } = buildHoldingsView(input());
    const [main, memes] = overview.byWallet;
    expect(main?.breakdown?.map((r) => [r.label, r.valueUsd, r.share])).toEqual([
      ['ETH', '1000.00', '0.998004'],
      ['X', '2.00', '0.001996'],
    ]);
    expect(memes?.breakdown?.map((r) => [r.label, r.valueUsd, r.share, r.totalShare])).toEqual([
      ['SOL', '300.00', '0.749064', '0.213904'],
      ['MEME', '100.00', '0.249688', '0.071301'],
      ['DUST', '0.50', '0.001248', '0.000357'],
    ]);
    expect(overview.byChain.find((r) => r.label === 'Solana')?.breakdown?.length).toBe(3);
  });

  it('gives each wallet group its share of the total and its 24h move', () => {
    const [main, memes] = buildHoldingsView(input()).wallets;
    expect(main).toMatchObject({ share: '0.714439' });
    expect(memes).toMatchObject({ share: '0.285561' });
    // No price history in this input: nothing is covered yet.
    expect(memes?.change24h).toEqual({
      usd: '0.00',
      pct: null,
      coveredValueUsd: '0.00',
      uncoveredCount: 3,
    });
  });

  it('has no shares or concentration when nothing is priced', () => {
    const { overview } = buildHoldingsView(input({ prices: new Map() }));
    expect(overview.totalUsd).toBe('0.00');
    expect(overview.byAsset).toEqual([]);
    expect(overview.concentration).toEqual({ largest: null, top3Share: null });
  });
});

describe('categories and themes (step 02b)', () => {
  const tag = (id: string, kind: string, name: string) => ({ id, kind, name });
  const tagged = () =>
    input({
      tags: {
        tags: [
          tag('t-major', 'category', 'Major'),
          tag('t-spec', 'category', 'Speculative'),
          tag('t-hooks', 'theme', 'V4 Hooks'),
          tag('t-ai', 'theme', 'AI'),
        ],
        coinTags: [
          // Test assets are outside the registry, so each coin is keyed by its own ref.
          { coinKey: `${RH}/token:eth`, tagId: 't-major' },
          { coinKey: `${SOL}/token:sol`, tagId: 't-major' },
          { coinKey: `${SOL}/token:meme`, tagId: 't-spec' },
          { coinKey: `${SOL}/token:meme`, tagId: 't-hooks' },
          { coinKey: `${SOL}/token:meme`, tagId: 't-ai' },
          { coinKey: `${RH}/token:eth`, tagId: 't-hooks' },
        ],
      },
    });

  it('shows each coin its category and themes', () => {
    const { overview } = buildHoldingsView(tagged());
    const meme = overview.byCoin.find((r) => r.label === 'MEME');
    expect(meme?.tags).toEqual({
      category: { id: 't-spec', name: 'Speculative' },
      themes: [
        { id: 't-ai', name: 'AI' },
        { id: 't-hooks', name: 'V4 Hooks' },
      ],
    });
  });

  it('breaks the total down by category, uncategorized last, adding up to 100%', () => {
    const { overview } = buildHoldingsView(tagged());
    expect(overview.byCategory.map((r) => [r.kind, r.label, r.valueUsd, r.detail])).toEqual([
      ['category', 'Major', '1300.00', 'ETH, SOL'],
      ['category', 'Speculative', '100.00', 'MEME'],
      ['untagged', null, '2.50', 'X, DUST'],
    ]);
    const sum = overview.byCategory.reduce((s, r) => s + Number(r.share), 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('opens a category to its coins, with shares of the category and of the total', () => {
    const { overview } = buildHoldingsView(tagged());
    const major = overview.byCategory[0];
    expect(major?.breakdown?.map((r) => [r.kind, r.label, r.share, r.totalShare])).toEqual([
      ['coin', 'ETH', '0.769231', '0.713012'],
      ['coin', 'SOL', '0.230769', '0.213904'],
    ]);
    // Coins inside a group keep their tags, so they can be tagged from there.
    expect(major?.breakdown?.[0]?.tags?.category?.name).toBe('Major');
    expect(overview.byCategory.at(-1)?.breakdown?.map((r) => r.label)).toEqual(['X', 'DUST']);
  });

  it('counts each coin once, under its combination of themes (ADR 0020)', () => {
    const { overview } = buildHoldingsView(tagged());
    expect(overview.byTheme.map((r) => [r.kind, r.key, r.label, r.valueUsd])).toEqual([
      ['theme', 't-hooks', 'V4 Hooks', '1000.00'], // ETH
      ['theme', 't-ai+t-hooks', 'AI + V4 Hooks', '100.00'], // MEME, in both
      ['untagged', 'untagged', null, '302.50'], // SOL, X, DUST
    ]);
    expect(overview.byTheme.reduce((s, r) => s + Number(r.share), 0)).toBeCloseTo(1, 5);
    expect(overview.byTheme[1]?.breakdown?.map((r) => r.label)).toEqual(['MEME']);
    expect(buildHoldingsView(tagged()).tags).toEqual({
      categories: [
        { id: 't-major', name: 'Major' },
        { id: 't-spec', name: 'Speculative' },
      ],
      themes: [
        { id: 't-ai', name: 'AI' },
        { id: 't-hooks', name: 'V4 Hooks' },
      ],
    });
  });

  it('follows the scope: one wallet only counts its own coins', () => {
    const { overview } = buildHoldingsView({ ...tagged(), walletId: 'memes' });
    expect(overview.byCategory.map((r) => [r.label, r.valueUsd])).toEqual([
      ['Major', '300.00'],
      ['Speculative', '100.00'],
      [null, '0.50'],
    ]);
  });
});

describe('wallet scope', () => {
  it('limits totals, lists, and accounts to the chosen wallet', () => {
    const view = buildHoldingsView(input({ walletId: 'memes' }));
    expect(view.scope).toEqual({ walletId: 'memes' });
    expect(view.totals.valueUsd).toBe('400.50');
    expect(view.wallets.map((w) => w.name)).toEqual(['Memes']);
    expect(view.accounts.map((a) => a.id)).toEqual(['b-sol']);
    expect(view.holdings.map((h) => h.symbol)).toEqual(['SOL', 'MEME', 'DUST', 'UNP']);
    expect(view.overview.byWallet).toEqual([]);
    expect(view.overview.byAsset.map((r) => [r.label, r.share])).toEqual([
      ['SOL', '0.749064'],
      ['MEME', '0.249688'],
      [null, '0.001248'],
    ]);
  });

  it('keeps every wallet and its total for the picker', () => {
    const view = buildHoldingsView(input({ walletId: 'memes' }));
    expect(view.walletOptions.map((w) => [w.name, w.valueUsd])).toEqual([
      ['Main', '1002.00'],
      ['Memes', '400.50'],
    ]);
  });

  it('rejects an unknown wallet', () => {
    expect(() => buildHoldingsView(input({ walletId: 'nope' }))).toThrow('Unknown wallet nope');
  });
});

describe('24h change', () => {
  const history = [
    point('eth', '160', at(10 * MIN), 'defillama'), // same source, 10 min off: the baseline
    point('eth', '100', at(80 * MIN), 'defillama'), // same source, further away
    point('sol', '100', at(0), 'jupiter'), // different source than SOL's current price
    point('meme', '0.00005', at(3 * HOUR)), // outside the 90-minute tolerance
  ];

  it('measures each position against the same-source price from ~24h earlier', () => {
    const view = buildHoldingsView(input({ priceHistory: history }));
    const eth = view.holdings.find((h) => h.symbol === 'ETH');
    expect(eth?.change24h).toEqual({
      pct: '0.250000',
      usd: '200.00',
      baselineUsd: '160',
      baselineAt: at(10 * MIN).toISOString(),
    });
    for (const symbol of ['SOL', 'MEME', 'X', 'DUST'])
      expect(view.holdings.find((h) => h.symbol === symbol)?.change24h).toBeNull();
  });

  it('says how much of the total the change covers', () => {
    const { overview } = buildHoldingsView(input({ priceHistory: history }));
    expect(overview.change24h).toEqual({
      usd: '200.00',
      pct: '0.250000',
      coveredValueUsd: '1000.00',
      uncoveredCount: 4,
    });
    expect(overview.byWallet[0]?.change24h).toMatchObject({ usd: '200.00', uncoveredCount: 1 });
    expect(overview.byAsset[0]?.change24h.pct).toBe('0.250000');
  });

  it('never reports a negative zero', () => {
    const view = buildHoldingsView(input({ priceHistory: [point('dust', '0.5000001', at(0))] }));
    // A tiny fall rounds to zero: "0.00" and "0.000000", not "-0.00" and "-0.000000".
    expect(view.holdings.find((h) => h.symbol === 'DUST')?.change24h).toMatchObject({
      usd: '0.00',
      pct: '0.000000',
    });
  });
});

describe('pickBaselines', () => {
  const current = new Map([price('eth', '200')]);

  it('takes the nearest same-source point within the tolerance; ties go to the older one', () => {
    const picked = pickBaselines(
      current,
      [point('eth', '1', at(-20 * MIN)), point('eth', '2', at(20 * MIN))],
      NOW,
      config,
    );
    expect(picked.get('eth')?.priceUsd).toBe('2');
  });

  it('skips stale current prices', () => {
    const stale = new Map([price('eth', '200')]);
    const later = new Date(NOW.getTime() + 2 * HOUR);
    expect(pickBaselines(stale, [point('eth', '1', at(0))], later, config).size).toBe(0);
  });
});

describe('summarizeChange', () => {
  it('has no percentage when nothing is covered', () => {
    expect(summarizeChange([{ visible: true, valueUsd: '5.00', change24h: null }])).toEqual({
      usd: '0.00',
      pct: null,
      coveredValueUsd: '0.00',
      uncoveredCount: 1,
    });
  });
});
