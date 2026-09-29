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
}

const job = <I extends z.ZodType, O extends z.ZodType>(def: JobDefinition<I, O>) => def;

export const JOBS = {
  /** Round-trip smoke test: proves enqueue -> worker -> result works. */
  systemPing: job({
    name: 'system.ping',
    input: z.object({ note: z.string().optional() }),
    output: z.object({ pong: z.literal(true), note: z.string().optional(), workerId: z.string() }),
  }),
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS]['name'];
