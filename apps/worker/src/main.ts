import { hostname } from 'node:os';
import { failInterruptedRuns, pruneHeartbeats, recordHeartbeat } from '@talewinds/db';
import { createPortfolioDeps } from '@talewinds/portfolio';
import { createQueue, startRuntime } from '@talewinds/runtime';
import { type WorkerContext, WorkerEnv } from './context.ts';
import { registerPortfolioHandlers } from './handlers/portfolio.ts';
import { registerSystemHandlers } from './handlers/system.ts';

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_RETENTION_MS = 24 * 60 * 60 * 1000;
/** A sync still "running" after this long belongs to a process that died. */
const INTERRUPTED_AFTER_MS = 30 * 60 * 1000;

const runtime = startRuntime({ name: 'worker', env: WorkerEnv });
const { log, database } = runtime;
const workerId = `${hostname()}:${process.pid}`;
const startedAt = new Date();

const interrupted = await failInterruptedRuns(
  database.db,
  new Date(Date.now() - INTERRUPTED_AFTER_MS),
);
if (interrupted > 0) log.warn({ interrupted }, 'marked interrupted sync runs as failed');

const queue = createQueue(runtime.env.DATABASE_URL, log);
await queue.start();
runtime.onShutdown(() => queue.stop());

const context: WorkerContext = {
  runtime,
  queue,
  workerId,
  portfolio: createPortfolioDeps({ db: database.db, env: runtime.env, log }),
};
await registerSystemHandlers(context);
await registerPortfolioHandlers(context);

const beat = () =>
  recordHeartbeat(database.db, {
    workerId,
    hostname: hostname(),
    pid: process.pid,
    startedAt,
  }).catch((err: unknown) => log.error({ err }, 'heartbeat failed'));
await pruneHeartbeats(database.db, new Date(Date.now() - HEARTBEAT_RETENTION_MS));
await beat();
const heartbeat = setInterval(beat, HEARTBEAT_INTERVAL_MS);
runtime.onShutdown(() => clearInterval(heartbeat));

log.info({ workerId, sources: context.portfolio.sources.describe() }, 'worker ready');
