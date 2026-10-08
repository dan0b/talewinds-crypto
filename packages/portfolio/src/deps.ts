import type { Db } from '@talewinds/db';
import type { Sources } from '@talewinds/sources';
import type { PortfolioConfig } from './config.ts';

/** The minimal logger capabilities need (pino satisfies it). */
export interface Log {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/** Everything portfolio capabilities need, injected so tests can use fakes. */
export interface PortfolioDeps {
  db: Db;
  sources: Sources;
  config: PortfolioConfig;
  log: Log;
  now?: () => Date;
}

export const nowOf = (deps: { now?: () => Date }) => (deps.now ? deps.now() : new Date());

/** Error text safe to store and show (provider errors never contain URLs or keys). */
export { describeError as errorMessage } from '@talewinds/db';
