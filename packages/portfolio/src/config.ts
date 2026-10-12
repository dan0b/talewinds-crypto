/** Timing and display rules for portfolio data. */
export interface PortfolioConfig {
  /** How often balances and prices sync. */
  syncIntervalMinutes: number;
  /** Balances older than this are shown as stale. */
  balanceStaleAfterMs: number;
  /** Prices older than this are shown as stale. */
  priceStaleAfterMs: number;
  /** After every price source misses an asset, wait this long before asking again. */
  priceMissCooldownMs: number;
  /**
   * A position worth more than this share of its pool's liquidity is flagged as illiquid: selling
   * it would move the price a lot, so its value is probably not realizable.
   */
  illiquidShareOfPool: number;
  /**
   * Verified, priced holdings worth less than this (USD, a decimal string) fold into one
   * "Small balances" line. Display only: they still count in every total.
   */
  smallBalanceUsd: string;
  /**
   * In allocation charts, rows worth less than this share of their chart fold into one "Other"
   * row, which opens to list them (a decimal string: "0.001" is 0.1%). Display only.
   */
  allocationOtherBelowShare: string;
  /** How far a 24h baseline price may sit from the 24-hour mark and still be used. */
  baselineToleranceMs: number;
}

const MINUTE = 60_000;

export function portfolioConfig(
  syncIntervalMinutes = 15,
  options: { smallBalanceUsd?: string } = {},
): PortfolioConfig {
  return {
    syncIntervalMinutes,
    // Two missed syncs in a row before we call balances stale.
    balanceStaleAfterMs: 2 * syncIntervalMinutes * MINUTE + 5 * MINUTE,
    priceStaleAfterMs: 60 * MINUTE,
    priceMissCooldownMs: 24 * 60 * MINUTE,
    illiquidShareOfPool: 0.1,
    smallBalanceUsd: options.smallBalanceUsd ?? '3',
    allocationOtherBelowShare: '0.001',
    baselineToleranceMs: 90 * MINUTE,
  };
}

/** Cron expression for the sync schedule. */
export function syncCron(syncIntervalMinutes: number): string {
  if (
    syncIntervalMinutes < 1 ||
    syncIntervalMinutes > 59 ||
    !Number.isInteger(syncIntervalMinutes)
  ) {
    throw new Error('Sync interval must be a whole number of minutes between 1 and 59');
  }
  return `*/${syncIntervalMinutes} * * * *`;
}
