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
 * An address you (or someone you track) controls, spanning every chain of its family: one EVM
 * address is one wallet on Ethereum, Robinhood Chain, and any other EVM chain; a Solana address is
 * one wallet on Solana. Groups its per-chain accounts and carries the name you give it (ADR 0016).
 */
export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    family: text('family').notNull(),
    /** Normalized (EVM lowercase; Solana case-sensitive). */
    address: text('address').notNull(),
    name: text('name'),
    ...timestamps,
  },
  (t) => [
    check('wallets_family', sql`${t.family} in ('evm', 'solana', 'bitcoin')`),
    uniqueIndex('wallets_family_address').on(t.family, t.address),
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
    /** The wallet this chain account belongs to (wallet accounts only). */
    walletId: uuid('wallet_id').references(() => wallets.id, { onDelete: 'cascade' }),
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
    index('accounts_wallet_idx').on(t.walletId),
    check('accounts_wallet_link', sql`${t.kind} <> 'wallet' or ${t.walletId} is not null`),
  ],
);
