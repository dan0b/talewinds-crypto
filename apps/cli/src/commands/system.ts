import { JOBS } from '@talewinds/core';
import { latestHeartbeat, pingDatabase, runMigrations } from '@talewinds/db';
import { createQueue } from '@talewinds/runtime';
import type { Command } from 'commander';
import { withRuntime } from '../context.ts';

export function registerSystemCommands(program: Command): void {
  program
    .command('db')
    .description('Database operations')
    .command('migrate')
    .description('Apply pending database migrations')
    .action(
      withRuntime(async (rt) => {
        await runMigrations(rt.database.db);
        console.log('Migrations up to date');
      }),
    );

  program
    .command('status')
    .description('Check database and worker health')
    .action(
      withRuntime(async (rt) => {
        const latencyMs = await pingDatabase(rt.database.db);
        console.log(`database  ok (${latencyMs}ms)`);
        const beat = await latestHeartbeat(rt.database.db);
        if (!beat) {
          console.log('worker    never seen — is `pnpm dev` running?');
          return;
        }
        const ageSec = Math.round((Date.now() - beat.lastSeenAt.getTime()) / 1000);
        console.log(`worker    last seen ${ageSec}s ago (${beat.workerId})`);
      }),
    );

  program
    .command('ping')
    .description('Round-trip a job through the queue and worker')
    .argument('[note]', 'text the worker echoes back')
    .action(
      withRuntime(async (rt, note: string | undefined) => {
        const queue = createQueue(rt.env.DATABASE_URL, rt.log);
        await queue.start();
        rt.onShutdown(() => queue.stop());

        const started = Date.now();
        const id = await queue.send(JOBS.systemPing, note ? { note } : {});
        const result = await queue.waitForResult(JOBS.systemPing, id);
        console.log(`pong from ${result.workerId} in ${Date.now() - started}ms`, result.note ?? '');
      }),
    );
}
