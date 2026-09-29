import type { AccountRow, HeartbeatRow } from '@talewinds/db';
import { Hono } from 'hono';

/**
 * Everything the API can do, as injected functions. Routes stay thin: they
 * call package capabilities and shape JSON. Tests pass fakes; main.ts passes
 * real database-backed implementations.
 */
export interface ApiDeps {
  pingDatabase(): Promise<number>;
  latestHeartbeat(): Promise<HeartbeatRow | null>;
  listAccounts(): Promise<AccountRow[]>;
}

/** A worker that hasn't checked in for this long is considered down. */
export const WORKER_STALE_AFTER_MS = 60_000;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'unknown error');

const toAccountDto = (a: AccountRow) => ({
  id: a.id,
  ref: a.ref,
  kind: a.kind,
  ownership: a.ownership,
  chainId: a.chainId,
  address: a.address,
  venue: a.venue,
  label: a.label,
  createdAt: a.createdAt.toISOString(),
});
export type AccountDto = ReturnType<typeof toAccountDto>;

export function createApp(deps: ApiDeps) {
  return new Hono()
    .basePath('/api')
    .get('/health', async (c) => {
      const [database, heartbeat] = await Promise.all([
        deps
          .pingDatabase()
          .then((latencyMs) => ({ ok: true, latencyMs, error: null }))
          .catch((err: unknown) => ({ ok: false, latencyMs: null, error: errorMessage(err) })),
        deps.latestHeartbeat().catch(() => null),
      ]);

      const lastSeenAt = heartbeat?.lastSeenAt ?? null;
      const worker = {
        ok: lastSeenAt !== null && Date.now() - lastSeenAt.getTime() < WORKER_STALE_AFTER_MS,
        workerId: heartbeat?.workerId ?? null,
        lastSeenAt: lastSeenAt?.toISOString() ?? null,
      };

      const ok = database.ok && worker.ok;
      return c.json({ ok, database, worker, checkedAt: new Date().toISOString() }, ok ? 200 : 503);
    })
    .get('/accounts', async (c) => {
      const rows = await deps.listAccounts();
      return c.json({ accounts: rows.map(toAccountDto) });
    });
}

/** Route types for the dashboard's typed client (`hc<AppType>`). */
export type AppType = ReturnType<typeof createApp>;
