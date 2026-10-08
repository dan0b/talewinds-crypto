import type { HeartbeatRow } from '@talewinds/db';
import { describe, expect, it } from 'vitest';
import { type ApiDeps, createApp, WORKER_STALE_AFTER_MS } from './app.ts';

const heartbeat = (ageMs: number): HeartbeatRow => ({
  workerId: 'test:1',
  hostname: 'test',
  pid: 1,
  startedAt: new Date(Date.now() - 3_600_000),
  lastSeenAt: new Date(Date.now() - ageMs),
});

const WALLET_ID = '01a0e4bb-6c32-76e6-9590-ce717185caaa';

const emptyHoldings = {
  asOf: new Date(0).toISOString(),
  totals: {
    valueUsd: '0.00',
    lowConfidenceValueUsd: '0.00',
    unpricedCount: 0,
    stalePriceCount: 0,
    disagreementCount: 0,
    illiquidCount: 0,
  },
  hidden: { count: 0, estimatedValueUsd: '0.00' },
  wallets: [],
  venues: [],
  holdings: [],
  accounts: [],
  quality: { staleAccounts: 0, failedAccounts: 0, partialAccounts: 0, neverSynced: 0 },
};

const deps = (overrides: Partial<ApiDeps> = {}): ApiDeps => ({
  pingDatabase: async () => 3,
  latestHeartbeat: async () => heartbeat(1_000),
  listAccounts: async () => [],
  getHoldings: async () => emptyHoldings,
  requestSync: async () => ({ queued: true }),
  setAssetStatus: async (id, status) => ({ id, status, statusSource: 'manual' }),
  describeSources: () => ({ sources: [], venues: { coinbase: false } }),
  addWallet: async () => ({ walletId: WALLET_ID, created: true, accounts: 2 }),
  renameWallet: async (walletId, name) => ({ walletId, name }),
  ...overrides,
});

describe('GET /api/health', () => {
  it('is healthy when the database answers and the worker is fresh', async () => {
    const res = await createApp(deps()).request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      database: { ok: true, latencyMs: 3 },
      worker: { ok: true },
    });
  });

  it('reports a stale worker as down', async () => {
    const app = createApp(
      deps({ latestHeartbeat: async () => heartbeat(WORKER_STALE_AFTER_MS + 1) }),
    );
    const res = await app.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, worker: { ok: false } });
  });

  it('reports an unreachable database without throwing', async () => {
    const app = createApp(
      deps({
        pingDatabase: async () => {
          throw new Error('connection refused');
        },
      }),
    );
    const res = await app.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      database: { ok: false, error: 'connection refused' },
    });
  });
});

describe('portfolio routes', () => {
  it('passes the hidden flag through to holdings', async () => {
    let seen: boolean | undefined;
    const app = createApp(
      deps({
        getHoldings: async (o) => {
          seen = o.includeHidden;
          return emptyHoldings;
        },
      }),
    );
    await app.request('/api/portfolio/holdings?hidden=1');
    expect(seen).toBe(true);
    await app.request('/api/portfolio/holdings');
    expect(seen).toBe(false);
    expect((await app.request('/api/portfolio/holdings?hidden=yes')).status).toBe(400);
  });

  it('accepts a sync request with 202', async () => {
    const res = await createApp(deps()).request('/api/portfolio/sync', { method: 'POST' });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ queued: true });
  });
});

describe('PUT /api/assets/:id/status', () => {
  const id = '01a0e4bb-6c32-76e6-9590-ce717185cabc';
  const put = (app: ReturnType<typeof createApp>, path: string, body: unknown) =>
    app.request(path, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  it('sets a manual status', async () => {
    const res = await put(createApp(deps()), `/api/assets/${id}/status`, {
      status: 'spam',
      reason: 'airdrop',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ asset: { id, status: 'spam', statusSource: 'manual' } });
  });

  it('rejects unknown statuses and malformed ids', async () => {
    expect(
      (await put(createApp(deps()), `/api/assets/${id}/status`, { status: 'awesome' })).status,
    ).toBe(400);
    expect(
      (await put(createApp(deps()), '/api/assets/not-a-uuid/status', { status: 'spam' })).status,
    ).toBe(400);
  });

  it('returns 404 for an unknown asset', async () => {
    const app = createApp(
      deps({
        setAssetStatus: async () => {
          throw new Error(`Unknown asset ${id}`);
        },
      }),
    );
    expect((await put(app, `/api/assets/${id}/status`, { status: 'spam' })).status).toBe(404);
  });
});

describe('wallet routes', () => {
  const send = (app: ReturnType<typeof createApp>, method: string, path: string, body: unknown) =>
    app.request(path, {
      method,
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  it('adds a wallet with 201', async () => {
    const res = await send(createApp(deps()), 'POST', '/api/wallets', {
      address: '0xabc',
      name: 'Degen',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ walletId: WALLET_ID, created: true, accounts: 2 });
  });

  it('turns validation errors into a readable 400', async () => {
    const app = createApp(
      deps({
        addWallet: async () => {
          throw new Error('Not a recognized wallet address');
        },
      }),
    );
    const res = await send(app, 'POST', '/api/wallets', { address: 'nope' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Not a recognized wallet address' });
    expect(
      (await send(app, 'POST', '/api/wallets', { address: 'x', chains: ['bitcoin'] })).status,
    ).toBe(400);
  });

  it('renames, and 404s an unknown wallet', async () => {
    const ok = await send(createApp(deps()), 'PATCH', `/api/wallets/${WALLET_ID}`, {
      name: 'Main',
    });
    expect(await ok.json()).toEqual({ walletId: WALLET_ID, name: 'Main' });
    const missing = createApp(
      deps({
        renameWallet: async () => {
          throw new Error('Unknown wallet');
        },
      }),
    );
    expect((await send(missing, 'PATCH', `/api/wallets/${WALLET_ID}`, { name: 'x' })).status).toBe(
      404,
    );
  });
});
