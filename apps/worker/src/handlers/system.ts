import { JOBS } from '@talewinds/core';
import type { WorkerContext } from '../context.ts';

export async function registerSystemHandlers({ queue, workerId }: WorkerContext): Promise<void> {
  await queue.work(JOBS.systemPing, async (input) => ({
    pong: true as const,
    note: input.note,
    workerId,
  }));
}
