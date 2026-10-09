import { createHash } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import type { Executor } from '../client.ts';
import { rawRecords } from '../schema/index.ts';
import { chunk } from '../util.ts';

export interface RawCaptureInput {
  provider: string;
  /** Stable, secret-free request description. Never include API keys or full URLs with keys. */
  requestKey: string;
  payload: unknown;
  fetchedAt: Date;
}

/** JSON with object keys sorted, so equal payloads hash equally regardless of key order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    }
    return v;
  });
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

/**
 * Identity of a raw record for deduplication. Must match the SQL backfill in migration
 * 0003_raw_records_dedupe_key: sha256(provider || '\n' || request_key || '\n' || content_hash).
 */
export function dedupeKeyOf(provider: string, requestKey: string, contentHash: string): string {
  return createHash('sha256').update(`${provider}\n${requestKey}\n${contentHash}`).digest('hex');
}

/**
 * Postgres jsonb cannot store U+0000. Replace it (only it) with U+FFFD for storage; the content
 * hash is computed on the original payload, so deduplication is unaffected.
 */
function storable(value: unknown): unknown {
  if (typeof value === 'string') return value.replaceAll('\u0000', '\ufffd');
  if (Array.isArray(value)) return value.map(storable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k.replaceAll('\u0000', '\ufffd'), storable(v)]),
    );
  }
  return value;
}

/**
 * Store provider responses (deduplicated) and return their IDs in input order. Records are
 * never updated: an identical response reuses the existing row.
 */
export async function saveRawRecords(db: Executor, captures: RawCaptureInput[]): Promise<string[]> {
  const rows = captures.map((c) => {
    const contentHash = hashPayload(c.payload);
    return {
      provider: c.provider,
      requestKey: c.requestKey,
      contentHash,
      dedupeKey: dedupeKeyOf(c.provider, c.requestKey, contentHash),
      // A bare JSON `null` is a real answer (e.g. "no sub-accounts"): store it as the JSON value
      // null, which is what was received, not as a missing (SQL NULL) payload.
      payload: c.payload === null ? sql`'null'::jsonb` : storable(c.payload),
      firstFetchedAt: c.fetchedAt,
    };
  });

  const ids = new Map<string, string>();
  for (const batch of chunk(rows, 200)) {
    const inserted = await db
      .insert(rawRecords)
      .values(batch)
      .onConflictDoNothing({ target: rawRecords.dedupeKey })
      .returning({ id: rawRecords.id, dedupeKey: rawRecords.dedupeKey });
    for (const r of inserted) ids.set(r.dedupeKey, r.id);
  }

  const missing = [...new Set(rows.map((r) => r.dedupeKey).filter((k) => !ids.has(k)))];
  for (const batch of chunk(missing, 1000)) {
    const existing = await db
      .select({ id: rawRecords.id, dedupeKey: rawRecords.dedupeKey })
      .from(rawRecords)
      .where(inArray(rawRecords.dedupeKey, batch));
    for (const r of existing) ids.set(r.dedupeKey, r.id);
  }

  return rows.map((r) => {
    const id = ids.get(r.dedupeKey);
    if (!id) throw new Error(`Raw record for ${r.provider} vanished during insert`);
    return id;
  });
}

export async function getRawRecords(db: Executor, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(rawRecords).where(inArray(rawRecords.id, ids));
}
