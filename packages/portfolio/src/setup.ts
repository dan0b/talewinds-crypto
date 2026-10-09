import type { Db } from '@talewinds/db';
import { createSources, SourcesEnv, type SourcesOptions } from '@talewinds/sources';
import { z } from 'zod';
import { type PortfolioConfig, portfolioConfig } from './config.ts';
import type { Log, PortfolioDeps } from './deps.ts';

/** Env for any process that syncs or shows portfolio data. Apps merge it into their env. */
export const PortfolioEnv = SourcesEnv.extend({
  PORTFOLIO_SYNC_MINUTES: z.coerce.number().int().min(1).max(59).default(15),
  /** Holdings worth less than this many USD fold into "Small balances" (still counted). */
  PORTFOLIO_SMALL_BALANCE_USD: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^\d+(\.\d+)?$/, 'PORTFOLIO_SMALL_BALANCE_USD should be a USD amount like 3 or 2.50')
      .default('3'),
  ),
});
export type PortfolioEnv = z.infer<typeof PortfolioEnv>;

/** Portfolio rules from env, so every app applies the same ones. */
export function portfolioConfigFromEnv(env: PortfolioEnv): PortfolioConfig {
  return portfolioConfig(env.PORTFOLIO_SYNC_MINUTES, {
    smallBalanceUsd: env.PORTFOLIO_SMALL_BALANCE_USD,
  });
}

/** The one way apps build portfolio capabilities, so api, worker, and cli behave identically. */
export function createPortfolioDeps(options: {
  db: Db;
  env: PortfolioEnv;
  log: Log;
  sources?: SourcesOptions;
}): PortfolioDeps {
  return {
    db: options.db,
    sources: createSources(options.env, options.sources),
    config: portfolioConfigFromEnv(options.env),
    log: options.log,
  };
}
