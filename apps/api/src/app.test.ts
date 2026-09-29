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

const deps = (overrides: Partial<ApiDeps> = {}): ApiDeps => ({
  pingDatabase: async () => 3,
  latestHeartbeat: async () => heartbeat(1_000),
  listAccounts: async () => [],
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
