import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * A person or group controlling one or more accounts: you ("self"), a KOL, a
 * bundler cluster, an exchange. Allowed `kind` values live in
 * @talewinds/core (ENTITY_KINDS) and are validated there.
 */
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    // Exactly one "self" entity may exist.
    uniqueIndex('entities_single_self').on(t.kind).where(sql`${t.kind} = 'self'`),
  ],
);

/**
 * Every wallet or venue account the platform knows about — yours or anyone
 * else's. `ownership` decides which calculations run on its data.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    /** Canonical identity: CAIP-10 for wallets, `venue:<venue>:<id>` for venues. */
    ref: text('ref').notNull().unique(),
    kind: text('kind').notNull(),
    ownership: text('ownership').notNull(),
    /** CAIP-2 chain ID (wallets only). */
    chainId: text('chain_id'),
    /** Normalized address (wallets; Hyperliquid venue accounts). */
    address: text('address'),
    venue: text('venue'),
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'set null' }),
    label: text('label'),
    ...timestamps,
  },
  (t) => [
    check('accounts_kind', sql`${t.kind} in ('wallet', 'venue')`),
    check('accounts_ownership', sql`${t.ownership} in ('owned', 'tracked', 'observed')`),
    check(
      'accounts_shape',
      sql`(${t.kind} = 'wallet' and ${t.chainId} is not null and ${t.address} is not null and ${t.venue} is null)
       or (${t.kind} = 'venue' and ${t.venue} is not null and ${t.chainId} is null)`,
    ),
    index('accounts_ownership_idx').on(t.ownership),
    index('accounts_address_idx').on(t.address),
    index('accounts_entity_idx').on(t.entityId),
  ],
);
