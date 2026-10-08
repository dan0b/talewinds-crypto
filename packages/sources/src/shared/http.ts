import type { z } from 'zod';
import type { RawCapture } from '../types.ts';
import { ProviderError } from './errors.ts';
import { parseProviderJson } from './json.ts';
import { RateLimiter, realSleep, type Sleep } from './limiter.ts';
import type { RequestMeter } from './meter.ts';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProviderClientOptions {
  /** Provider name recorded with every raw capture, e.g. `blockscout:ethereum`. */
  provider: string;
  /** May embed a secret (e.g. an Alchemy key). Never logged, stored, or put in errors. */
  baseUrl: string;
  /** Minimum spacing between request starts. */
  minIntervalMs: number;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  /** Secrets (e.g. an API key) to scrub from any provider text that ends up in an error. */
  redact?: string[];
  fetch?: FetchFn;
  sleep?: Sleep;
}

export interface CallContext {
  meter: RequestMeter;
  /** Stable, secret-free description of the request, stored with the raw capture. */
  requestKey: string;
}

export interface Fetched<T> {
  data: T;
  raw: RawCapture;
}

const USER_AGENT = 'talewinds/0.1 (personal portfolio; read-only)';

/**
 * HTTP client for one provider: rate-limited, retried with backoff on 429/5xx/network errors,
 * time-bounded, and every response validated with a Zod schema before anything uses it.
 */
export class ProviderClient {
  readonly provider: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: FetchFn;
  private readonly sleep: Sleep;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly options: ProviderClientOptions;

  constructor(options: ProviderClientOptions) {
    this.options = options;
    this.provider = options.provider;
    this.sleep = options.sleep ?? realSleep;
    this.limiter = new RateLimiter(options.minIntervalMs, this.sleep);
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  getJson<S extends z.ZodType>(path: string, schema: S, ctx: CallContext) {
    return this.request(path, { method: 'GET' }, schema, ctx);
  }

  postJson<S extends z.ZodType>(path: string, body: unknown, schema: S, ctx: CallContext) {
    return this.request(
      path,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      },
      schema,
      ctx,
    );
  }

  /**
   * The provider's own explanation of a client error (e.g. "network not enabled for this app"),
   * short, single-line, and with secrets scrubbed. Null when there's nothing useful.
   */
  private errorDetail(text: string): string | null {
    let message: unknown;
    try {
      const body = JSON.parse(text) as Record<string, unknown>;
      const err = body.error;
      message =
        (err && typeof err === 'object' ? (err as Record<string, unknown>).message : err) ??
        body.message;
    } catch {
      return null; // HTML error pages etc. carry nothing we want to show
    }
    if (typeof message !== 'string' || !message.trim()) return null;
    let clean = message.replace(/\s+/g, ' ').trim();
    for (const secret of this.options.redact ?? []) {
      if (secret) clean = clean.replaceAll(secret, '[redacted]');
    }
    return clean.length > 240 ? `${clean.slice(0, 239)}…` : clean;
  }

  /** Wait before a retry: exponential backoff with jitter, or the provider's Retry-After. */
  async backoff(attempt: number, retryAfterSeconds?: number): Promise<void> {
    const base = retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : 1000 * 2 ** attempt;
    const ms = Math.min(base + Math.random() * 250, 30_000);
    this.limiter.penalize(ms);
    await this.sleep(ms);
  }

  private async request<S extends z.ZodType>(
    path: string,
    init: RequestInit,
    schema: S,
    ctx: CallContext,
  ): Promise<Fetched<z.infer<S>>> {
    const url = `${this.options.baseUrl}${path}`;

    for (let attempt = 0; ; attempt++) {
      await this.limiter.acquire();
      ctx.meter.count(this.provider);

      let res: Response;
      try {
        res = await this.fetchFn(url, {
          ...init,
          headers: {
            accept: 'application/json',
            'user-agent': USER_AGENT,
            ...this.options.headers,
            ...(init.headers as Record<string, string> | undefined),
          },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        const reason =
          err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : 'network error';
        if (attempt < this.maxRetries) {
          await this.backoff(attempt);
          continue;
        }
        throw new ProviderError(this.provider, `${reason} after ${attempt + 1} attempts`, {
          retryable: true,
        });
      }

      if (res.status === 429 || res.status >= 500) {
        await res.body?.cancel();
        if (attempt < this.maxRetries) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await this.backoff(
            attempt,
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
          );
          continue;
        }
        throw new ProviderError(this.provider, `HTTP ${res.status} after ${attempt + 1} attempts`, {
          status: res.status,
          retryable: true,
        });
      }

      const text = await res.text();
      if (!res.ok) {
        const detail = this.errorDetail(text);
        throw new ProviderError(this.provider, `HTTP ${res.status}${detail ? `: ${detail}` : ''}`, {
          status: res.status,
        });
      }

      let json: unknown;
      try {
        json = parseProviderJson(text);
      } catch {
        // e.g. a bot-protection HTML page instead of an API response
        throw new ProviderError(
          this.provider,
          'response was not JSON (blocked or wrong endpoint?)',
          {
            status: res.status,
          },
        );
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue?.path.join('.') || '(root)';
        throw new ProviderError(
          this.provider,
          `unexpected response shape at ${where}: ${issue?.message}`,
        );
      }

      return {
        data: parsed.data as z.infer<S>,
        raw: {
          provider: this.provider,
          requestKey: ctx.requestKey,
          payload: json,
          fetchedAt: new Date(),
        },
      };
    }
  }
}
