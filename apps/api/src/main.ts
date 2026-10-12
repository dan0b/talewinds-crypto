import { serve } from '@hono/node-server';
import { JOBS } from '@talewinds/core';
import {
  createTag,
  deleteTag,
  latestHeartbeat,
  listAccounts,
  pingDatabase,
  renameTag,
  setCoinCategory,
  setCoinThemes,
} from '@talewinds/db';
import {
  addWallet,
  getHoldings,
  getValueHistory,
  PortfolioEnv,
  portfolioConfigFromEnv,
  removeWallet,
  renameWallet,
  setAssetStatus,
} from '@talewinds/portfolio';
import { BaseEnv, createQueue, startRuntime } from '@talewinds/runtime';
import { createSources } from '@talewinds/sources';
import { z } from 'zod';
import { createApp } from './app.ts';

const Env = BaseEnv.extend(PortfolioEnv.shape).extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
});

const runtime = startRuntime({ name: 'api', env: Env });
const { db } = runtime.database;
const config = portfolioConfigFromEnv(runtime.env);

// The API never calls providers; this only describes how the worker will read each chain.
const configured = createSources(runtime.env);
const sourcesDescription = { sources: configured.describe(), venues: configured.venues };

const queue = createQueue(runtime.env.DATABASE_URL, runtime.log);
await queue.start();
runtime.onShutdown(() => queue.stop());

const app = createApp({
  pingDatabase: () => pingDatabase(db),
  latestHeartbeat: () => latestHeartbeat(db),
  listAccounts: () => listAccounts(db),
  getHoldings: (options) => getHoldings({ db, config, venues: configured.venues }, options),
  getValueHistory: (options) => getValueHistory({ db, config }, options),
  requestSync: async () => ({ queued: (await queue.send(JOBS.portfolioSyncAll, {})) !== null }),
  describeSources: () => sourcesDescription,
  addWallet: async (input) => {
    const { wallet, accounts, created } = await addWallet(db, input);
    await queue.send(JOBS.portfolioSyncAll, {}); // declined if one is already queued; that one covers it
    return { walletId: wallet.id, created, accounts: accounts.length };
  },
  renameWallet: async (id, name) => {
    const row = await renameWallet(db, id, name);
    return { walletId: row.id, name: row.name };
  },
  removeWallet: async (id) => {
    const { wallet, accounts } = await removeWallet(db, id);
    return { walletId: wallet.id, name: wallet.name, accounts };
  },
  createTag: async (kind, name) => {
    const t = await createTag(db, kind, name);
    return { id: t.id, kind: t.kind, name: t.name };
  },
  renameTag: async (id, name) => {
    const t = await renameTag(db, id, name);
    return { id: t.id, kind: t.kind, name: t.name };
  },
  deleteTag: (id) => deleteTag(db, id),
  setCoinCategory: (coinKey, tagId) => setCoinCategory(db, coinKey, tagId),
  setCoinThemes: (coinKey, tagIds) => setCoinThemes(db, coinKey, tagIds),
  setAssetStatus: async (id, status, reason) => {
    const row = await setAssetStatus(db, id, status, reason);
    return { id: row.id, status: row.status, statusSource: row.statusSource };
  },
});

// Localhost only: the API has no authentication yet. Binding to a public
// interface requires adding auth first (see apps/api/CLAUDE.md).
const server = serve(
  { fetch: app.fetch, port: runtime.env.API_PORT, hostname: '127.0.0.1' },
  (info) => runtime.log.info({ url: `http://127.0.0.1:${info.port}/api` }, 'api listening'),
);
runtime.onShutdown(() => new Promise<void>((resolve) => server.close(() => resolve())));
