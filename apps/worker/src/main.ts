import { hostname } from 'node:os';
import { pruneHeartbeats, recordHeartbeat } from '@talewinds/db';
import { createQueue, startRuntime } from '@talewinds/runtime';
import type { WorkerContext } from './context.ts';
import { registerSystemHandlers } from './handlers/system.ts';

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_RETENTION_MS = 24 * 60 * 60 * 1000;

const runtime = startRuntime({ name: 'worker' });
const { log, database } = runtime;
const workerId = `${hostname()}:${process.pid}`;
const startedAt = new Date();

const queue = createQueue(runtime.env.DATABASE_URL, log);
await queue.start();
runtime.onShutdown(() => queue.stop());

const context: WorkerContext = { runtime, queue, workerId };
await registerSystemHandlers(context);

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

log.info({ workerId }, 'worker ready');
