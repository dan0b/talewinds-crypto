import type { AppType } from '@talewinds/api';
import { hc, type InferResponseType } from 'hono/client';

/**
 * Typed API client. Route paths, params, and response shapes come straight
 * from the API's route definitions — no hand-written types, no codegen.
 * Usage: `await (await api.health.$get()).json()`
 */
export const api = hc<AppType>(window.location.origin).api;

export type HoldingsView = InferResponseType<typeof api.portfolio.holdings.$get, 200>;
export type ValueHistory = InferResponseType<typeof api.portfolio.history.$get, 200>;
export type Holding = HoldingsView['holdings'][number];
export type AccountSyncStatus = HoldingsView['accounts'][number];

type ResponseWith<R, S extends number> = Extract<R, { status: S }>;

/**
 * Return the body of the expected status (200 by default), typed as that route's success shape
 * (not a union with its error bodies). Any other status throws with the API's own error message
 * when it sent one, so forms can show it.
 */
export async function okJson<
  R extends { status: number; json(): Promise<unknown> },
  S extends number = 200,
>(res: R, status: S = 200 as S): Promise<Awaited<ReturnType<ResponseWith<R, S>['json']>>> {
  if (res.status !== status) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const message =
      typeof body?.error === 'string' ? body.error : `API request failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return (await res.json()) as Awaited<ReturnType<ResponseWith<R, S>['json']>>;
}

export type WalletGroup = HoldingsView['wallets'][number];
export type ChainGroup = WalletGroup['chains'][number];
export type Position = ChainGroup['positions'][number];

/** For calls whose body isn't needed: throw on non-2xx. */
export async function ok<R extends { ok: boolean; status: number }>(res: R): Promise<R> {
  if (!res.ok) throw new Error(`API request failed (HTTP ${res.status})`);
  return res;
}
