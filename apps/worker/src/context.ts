import { type PortfolioDeps, PortfolioEnv } from '@talewinds/portfolio';
import { BaseEnv, type Queue, type Runtime } from '@talewinds/runtime';
import type { z } from 'zod';

export const WorkerEnv = BaseEnv.extend(PortfolioEnv.shape);
export type WorkerEnv = z.infer<typeof WorkerEnv>;

/** What every job handler gets. Add shared clients here as slices need them. */
export interface WorkerContext {
  runtime: Runtime<WorkerEnv>;
  queue: Queue;
  workerId: string;
  portfolio: PortfolioDeps;
}
