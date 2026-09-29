import { serve } from '@hono/node-server';
import { latestHeartbeat, listAccounts, pingDatabase } from '@talewinds/db';
import { BaseEnv, startRuntime } from '@talewinds/runtime';
import { z } from 'zod';
import { createApp } from './app.ts';

const Env = BaseEnv.extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
});

const runtime = startRuntime({ name: 'api', env: Env });
const { db } = runtime.database;

const app = createApp({
  pingDatabase: () => pingDatabase(db),
  latestHeartbeat: () => latestHeartbeat(db),
  listAccounts: () => listAccounts(db),
});

// Localhost only: the API has no authentication yet. Binding to a public
// interface requires adding auth first (see apps/api/CLAUDE.md).
const server = serve(
  { fetch: app.fetch, port: runtime.env.API_PORT, hostname: '127.0.0.1' },
  (info) => runtime.log.info({ url: `http://127.0.0.1:${info.port}/api` }, 'api listening'),
);
runtime.onShutdown(() => new Promise<void>((resolve) => server.close(() => resolve())));
