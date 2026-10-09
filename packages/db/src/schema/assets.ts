import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Every asset the platform has seen, identified by CAIP-19 `ref` (chain + contract), never by
 * ticker. Symbol and name are sanitized display text (see core `sanitizeTokenText`).
 */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    ref: text('ref').notNull().unique(),
    chainId: text('chain_id').notNull(),
    kind: text('kind').notNull(),
    /** Contract (EVM) or mint (Solana); null for native and venue assets (ADR 0018). */
    address: text('address'),
    symbol: text('symbol'),
    name: text('name'),
    decimals: integer('decimals').notNull(),
    /** Where `decimals` came from, e.g. `rpc`, `blockscout`, `alchemy`, `solana-rpc`. */
    decimalsSource: text('decimals_source').notNull(),
    metadataSource: text('metadata_source'),
    status: text('status').notNull().default('unverified'),
    statusSource: text('status_source').notNull().default('auto'),
    /** Last time every price source came up empty; skip re-checking for a while. */
    priceMissAt: timestamp('price_miss_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('assets_kind', sql`${t.kind} in ('native', 'token', 'venue')`),
    check('assets_status', sql`${t.status} in ('verified', 'unverified', 'spam')`),
    check('assets_status_source', sql`${t.statusSource} in ('auto', 'manual')`),
    check(
      'assets_shape',
      sql`(${t.kind} in ('native', 'venue') and ${t.address} is null) or (${t.kind} = 'token' and ${t.address} is not null)`,
    ),
    check('assets_decimals', sql`${t.decimals} between 0 and 255`),
    index('assets_chain_idx').on(t.chainId),
  ],
);

/** Append-only history of status changes, so a manual correction never erases the original. */
export const assetStatusHistory = pgTable(
  'asset_status_history',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    source: text('source').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('asset_status_history_status', sql`${t.status} in ('verified', 'unverified', 'spam')`),
    check('asset_status_history_source', sql`${t.source} in ('auto', 'manual')`),
    index('asset_status_history_asset_idx').on(t.assetId, t.createdAt),
  ],
);
