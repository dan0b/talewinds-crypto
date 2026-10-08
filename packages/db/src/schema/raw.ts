import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Provider responses exactly as received. Insert-only, never edited: everything derived from
 * them (balances, prices, later events) links back here and can be recomputed.
 *
 * Identical responses are stored once (deduplicated by provider + request + content hash);
 * each observation that relies on a response records its own timestamp.
 */
export const rawRecords = pgTable('raw_records', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  provider: text('provider').notNull(),
  /** Stable, secret-free description of the request. Can be long (batched requests). */
  requestKey: text('request_key').notNull(),
  /** sha256 of the canonical JSON payload. */
  contentHash: text('content_hash').notNull(),
  /**
   * sha256 of provider + request key + content hash: the identity used for deduplication. Hashed
   * because a btree index entry can't exceed ~2.7 KB and batched request keys get longer than that.
   */
  dedupeKey: text('dedupe_key').notNull().unique(),
  payload: jsonb('payload').notNull(),
  firstFetchedAt: timestamp('first_fetched_at', { withTimezone: true }).notNull(),
});
