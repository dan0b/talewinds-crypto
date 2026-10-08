import type { Note } from '@talewinds/core';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.ts';
import { assets } from './assets.ts';
import { rawRecords } from './raw.ts';

/** A note attached to a sync run: something it couldn't see or had to skip. */
export type SyncNote = Note;

/**
 * One attempt to read an account's balances. `partial` means it succeeded but couldn't see
 * everything (the notes say what's missing); holdings from a partial run are shown as incomplete.
 */
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
    notes: jsonb('notes').$type<SyncNote[]>().notNull().default([]),
    requestCount: integer('request_count').notNull().default(0),
  },
  (t) => [
    check('sync_runs_kind', sql`${t.kind} in ('balances')`),
    check('sync_runs_status', sql`${t.status} in ('running', 'succeeded', 'partial', 'failed')`),
    index('sync_runs_account_idx').on(t.accountId, t.startedAt),
  ],
);

/** What an account held at the time of one sync run. Zero balances are not stored. */
export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    /** Integer amount in the asset's smallest unit. numeric(78,0) fits any uint256. */
    rawAmount: numeric('raw_amount', { precision: 78, scale: 0 }).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    rawRecordId: uuid('raw_record_id')
      .notNull()
      .references(() => rawRecords.id),
  },
  (t) => [
    uniqueIndex('balance_snapshots_run_asset').on(t.syncRunId, t.assetId),
    index('balance_snapshots_account_idx').on(t.accountId, t.observedAt),
  ],
);

/** A USD price for an asset from one source at one moment. */
export const priceObservations = pgTable(
  'price_observations',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    priceUsd: numeric('price_usd').notNull(),
    source: text('source').notNull(),
    confidence: text('confidence').notNull(),
    /** Market data from the same source and moment, when it provides them. */
    marketCapUsd: numeric('market_cap_usd'),
    fdvUsd: numeric('fdv_usd'),
    /** Depth of the market the price came from. */
    liquidityUsd: numeric('liquidity_usd'),
    /** A second source that disagreed beyond the threshold (ADR 0015). */
    crossCheckSource: text('cross_check_source'),
    crossCheckPriceUsd: numeric('cross_check_price_usd'),
    /** When the price was valid, per the provider (falls back to fetch time if not given). */
    pricedAt: timestamp('priced_at', { withTimezone: true }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    rawRecordId: uuid('raw_record_id')
      .notNull()
      .references(() => rawRecords.id),
  },
  (t) => [
    check('price_observations_confidence', sql`${t.confidence} in ('high', 'low')`),
    index('price_observations_asset_idx').on(t.assetId, t.pricedAt),
  ],
);
