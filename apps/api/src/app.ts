import { AssetStatus, CHAIN_KEYS } from '@talewinds/core';
import type { AccountRow, HeartbeatRow } from '@talewinds/db';
import type { HoldingsView } from '@talewinds/portfolio';
import type { SourceDescription } from '@talewinds/sources';
import { Hono } from 'hono';
import { validator } from 'hono/validator';
import { z } from 'zod';

/**
 * Everything the API can do, as injected functions. Routes stay thin: they
 * call package capabilities and shape JSON. Tests pass fakes; main.ts passes
 * real database-backed implementations.
 */
export interface ApiDeps {
  pingDatabase(): Promise<number>;
  latestHeartbeat(): Promise<HeartbeatRow | null>;
  listAccounts(): Promise<AccountRow[]>;
  getHoldings(options: { includeHidden: boolean }): Promise<HoldingsView>;
  /** Enqueue a portfolio sync. `queued: false` means one is already waiting. */
  requestSync(): Promise<{ queued: boolean }>;
  setAssetStatus(
    assetId: string,
    status: AssetStatus,
    reason: string | null,
  ): Promise<{ id: string; status: string; statusSource: string }>;
  /** How each chain is being read, and which venue keys are set (no secrets). */
  describeSources(): { sources: SourceDescription[]; venues: { coinbase: boolean } };
  /** Add a wallet (idempotent) and queue a sync so its balances appear. */
  addWallet(
    input: z.infer<typeof WalletBody>,
  ): Promise<{ walletId: string; created: boolean; accounts: number }>;
  renameWallet(
    walletId: string,
    name: string | null,
  ): Promise<{ walletId: string; name: string | null }>;
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

const StatusBody = z.object({
  status: AssetStatus,
  reason: z.string().max(500).nullable().optional(),
});

const HoldingsQuery = z.object({ hidden: z.enum(['0', '1']).optional() });

const WalletBody = z.object({
  address: z.string().trim().min(1).max(100),
  name: z.string().trim().max(64).nullish(),
  chains: z.array(z.enum(CHAIN_KEYS)).min(1).optional(),
});
const RenameBody = z.object({ name: z.string().trim().max(64).nullable() });

/** Validate a request part with a Zod schema; the parsed type flows to the typed client. */
const valid = <T extends 'json' | 'query', S extends z.ZodType>(target: T, schema: S) =>
  validator(target, (value, c) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return c.json(
        { error: 'invalid request', issues: parsed.error.issues.map((i) => i.message) },
        400,
      );
    }
    return parsed.data as z.infer<S>;
  });

const Uuid = z.uuid();

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
      return c.json({ accounts: rows.map(toAccountDto) }, 200);
    })
    .get('/system/sources', (c) => c.json(deps.describeSources(), 200))
    .get('/portfolio/holdings', valid('query', HoldingsQuery), async (c) => {
      const { hidden } = c.req.valid('query');
      return c.json(await deps.getHoldings({ includeHidden: hidden === '1' }), 200);
    })
    .post('/portfolio/sync', async (c) => {
      const { queued } = await deps.requestSync();
      return c.json({ queued }, 202);
    })
    .post('/wallets', valid('json', WalletBody), async (c) => {
      try {
        return c.json(await deps.addWallet(c.req.valid('json')), 201);
      } catch (err) {
        // Validation errors from core (e.g. unrecognized address, wrong-family chain) are the
        // caller's to fix; their messages are safe and meant for people.
        return c.json({ error: errorMessage(err) }, 400);
      }
    })
    .patch('/wallets/:id', valid('json', RenameBody), async (c) => {
      const id = c.req.param('id');
      if (!Uuid.safeParse(id).success) return c.json({ error: 'invalid wallet id' }, 400);
      try {
        return c.json(await deps.renameWallet(id, c.req.valid('json').name), 200);
      } catch (err) {
        if (errorMessage(err).startsWith('Unknown wallet'))
          return c.json({ error: 'wallet not found' }, 404);
        throw err;
      }
    })
    .put('/assets/:id/status', valid('json', StatusBody), async (c) => {
      const id = c.req.param('id');
      if (!Uuid.safeParse(id).success) return c.json({ error: 'invalid asset id' }, 400);
      const { status, reason } = c.req.valid('json');
      try {
        return c.json({ asset: await deps.setAssetStatus(id, status, reason ?? null) }, 200);
      } catch (err) {
        if (errorMessage(err).startsWith('Unknown asset'))
          return c.json({ error: 'asset not found' }, 404);
        throw err;
      }
    });
}

/** Route types for the dashboard's typed client (`hc<AppType>`). */
export type AppType = ReturnType<typeof createApp>;
