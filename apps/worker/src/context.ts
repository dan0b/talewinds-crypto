import type { BaseEnv, Queue, Runtime } from '@talewinds/runtime';

/** What every job handler gets. Add shared clients (sources, ai) here as slices need them. */
export interface WorkerContext {
  runtime: Runtime<BaseEnv>;
  queue: Queue;
  workerId: string;
}
