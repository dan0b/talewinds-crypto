import { z } from 'zod';

/**
 * Background job contracts: queue name + validated input/output. The worker
 * handles them; the CLI and API enqueue them. Defining them here keeps both
 * sides agreeing on the shape.
 */
export interface JobDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  input: I;
  output: O;
  /**
   * Queue policy. `stately` allows at most one queued and one running job, so repeated requests
   * (e.g. clicking "refresh" several times) don't pile up. Defaults to `standard`.
   */
  policy?: 'standard' | 'stately';
}

const job = <I extends z.ZodType, O extends z.ZodType>(def: JobDefinition<I, O>) => def;

export const JOBS = {
  /** Round-trip smoke test: proves enqueue -> worker -> result works. */
  systemPing: job({
    name: 'system.ping',
    input: z.object({ note: z.string().optional() }),
    output: z.object({ pong: z.literal(true), note: z.string().optional(), workerId: z.string() }),
  }),

  /** Sync balances for every owned wallet, then refresh prices. Scheduled and on demand. */
  portfolioSyncAll: job({
    name: 'portfolio.syncAll',
    policy: 'stately',
    input: z.object({}),
    output: z.object({
      accounts: z.number().int(),
      succeeded: z.number().int(),
      partial: z.number().int(),
      failed: z.number().int(),
      pricesUpdated: z.number().int(),
    }),
  }),
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS]['name'];
