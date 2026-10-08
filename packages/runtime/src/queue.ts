import { setTimeout as sleep } from 'node:timers/promises';
import type { JobDefinition } from '@talewinds/core';
import { PgBoss } from 'pg-boss';
import type { z } from 'zod';
import type { Logger } from './logger.ts';

type AnyJob = JobDefinition<z.ZodType, z.ZodType>;

/**
 * Typed wrapper over pg-boss (a job queue stored in Postgres — no Redis).
 * Inputs are validated when sent and again when worked; outputs are validated
 * when read back. Job contracts live in @talewinds/core (JOBS).
 */
export interface Queue {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Enqueue a job. Returns null when the queue's policy declined a duplicate (already queued). */
  send<J extends AnyJob>(job: J, input: z.input<J['input']>): Promise<string | null>;
  /** Run a job on a cron schedule (stored in Postgres; safe with several workers). */
  schedule<J extends AnyJob>(job: J, cron: string, input: z.input<J['input']>): Promise<void>;
  work<J extends AnyJob>(
    job: J,
    handler: (input: z.infer<J['input']>, jobId: string) => Promise<z.input<J['output']>>,
  ): Promise<void>;
  waitForResult<J extends AnyJob>(
    job: J,
    id: string,
    options?: { timeoutMs?: number },
  ): Promise<z.infer<J['output']>>;
}

export function createQueue(databaseUrl: string, log: Logger): Queue {
  const boss = new PgBoss({ connectionString: databaseUrl, schema: 'pgboss' });
  boss.on('error', (err) => log.error({ err }, 'queue error'));

  const ensured = new Set<string>();
  const ensureQueue = async (job: AnyJob) => {
    if (ensured.has(job.name)) return;
    await boss.createQueue(job.name, { policy: job.policy ?? 'standard' });
    ensured.add(job.name);
  };

  return {
    async start() {
      await boss.start();
    },

    async stop() {
      await boss.stop({ graceful: true, timeout: 10_000 });
    },

    async send(job, input) {
      await ensureQueue(job);
      return boss.send(job.name, job.input.parse(input) as object);
    },

    async schedule(job, cron, input) {
      await ensureQueue(job);
      await boss.schedule(job.name, cron, job.input.parse(input) as object);
    },

    async work<J extends AnyJob>(
      job: J,
      handler: (input: z.infer<J['input']>, jobId: string) => Promise<z.input<J['output']>>,
    ) {
      await ensureQueue(job);
      await boss.work<unknown>(job.name, async ([item]) => {
        if (!item) return;
        const input = job.input.parse(item.data) as z.infer<J['input']>;
        log.info({ job: job.name, id: item.id }, 'job started');
        const output = job.output.parse(await handler(input, item.id));
        log.info({ job: job.name, id: item.id }, 'job completed');
        return output;
      });
    },

    async waitForResult<J extends AnyJob>(job: J, id: string, { timeoutMs = 15_000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const [found] = await boss.findJobs(job.name, { id });
        if (found?.state === 'completed') {
          return job.output.parse(found.output) as z.infer<J['output']>;
        }
        if (found && (found.state === 'failed' || found.state === 'cancelled')) {
          throw new Error(`Job ${job.name} ${id} ${found.state}: ${JSON.stringify(found.output)}`);
        }
        await sleep(250);
      }
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${job.name} ${id}`);
    },
  };
}
