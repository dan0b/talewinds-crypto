import { readFileSync } from 'node:fs';
import type { FetchFn } from '../shared/http.ts';

/** Test-only helpers: serve recorded fixtures instead of calling providers. */

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../test/fixtures/${name}`, import.meta.url), 'utf8'));
}

export interface FakeRequest {
  url: string;
  method: string;
  /** Parsed JSON body, if any (e.g. a JSON-RPC request). */
  body: { method?: string; params?: unknown[] } | undefined;
  /** Request headers, lowercased names (e.g. to check a signed `authorization`). */
  headers: Record<string, string>;
}

/** Return a JSON value, a Response, or undefined to let the next route try. */
export type Route = (req: FakeRequest) => unknown;

export function fakeFetch(routes: Route[]): FetchFn & { calls: FakeRequest[] } {
  const calls: FakeRequest[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string> | undefined) ?? {}).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    const req: FakeRequest = { url, method: init?.method ?? 'GET', body, headers };
    calls.push(req);
    for (const route of routes) {
      const out = route(req);
      if (out === undefined) continue;
      if (out instanceof Response) return out;
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`fakeFetch: no route for ${req.method} ${url} ${body?.method ?? ''}`);
  };
  return Object.assign(fn, { calls });
}

/** Match a JSON-RPC call by method (and optionally a predicate on its params). */
export const rpc =
  (method: string, reply: unknown, match: (params: unknown[]) => boolean = () => true): Route =>
  (req) =>
    req.body?.method === method && match(req.body.params ?? []) ? reply : undefined;

/** Match a GET by URL substring. */
export const get =
  (urlPart: string, reply: unknown): Route =>
  (req) =>
    req.method === 'GET' && req.url.includes(urlPart) ? reply : undefined;

export const noSleep = async () => {};
