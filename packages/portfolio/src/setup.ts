import type { Db } from '@talewinds/db';
import { createSources, SourcesEnv, type SourcesOptions } from '@talewinds/sources';
import { z } from 'zod';
import { portfolioConfig } from './config.ts';
import type { Log, PortfolioDeps } from './deps.ts';

/** Env for any process that syncs or shows portfolio data. Apps merge it into their env. */
export const PortfolioEnv = SourcesEnv.extend({
  PORTFOLIO_SYNC_MINUTES: z.coerce.number().int().min(1).max(59).default(15),
});
export type PortfolioEnv = z.infer<typeof PortfolioEnv>;

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
    config: portfolioConfig(options.env.PORTFOLIO_SYNC_MINUTES),
    log: options.log,
  };
}
