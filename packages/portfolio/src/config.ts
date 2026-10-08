/** Timing rules for portfolio data. */
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
}

const MINUTE = 60_000;

export function portfolioConfig(syncIntervalMinutes = 15): PortfolioConfig {
  return {
    syncIntervalMinutes,
    // Two missed syncs in a row before we call balances stale.
    balanceStaleAfterMs: 2 * syncIntervalMinutes * MINUTE + 5 * MINUTE,
    priceStaleAfterMs: 60 * MINUTE,
    priceMissCooldownMs: 24 * 60 * MINUTE,
    illiquidShareOfPool: 0.1,
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
