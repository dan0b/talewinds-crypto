import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Your own labels for coins (step 02b): a **category** (at most one per coin, e.g. Major or
 * Speculative) or a **theme** (any number per coin, e.g. V4 Hooks). Names are unique per kind,
 * ignoring case.
 */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().default(sql`uuidv7()`),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('tags_kind', sql`${t.kind} in ('category', 'theme')`),
    uniqueIndex('tags_kind_name').on(t.kind, sql`lower(${t.name})`),
    // Lets coin_tags reference (id, kind), so an assignment's kind always matches its tag.
    unique('tags_id_kind').on(t.id, t.kind),
  ],
);

/**
 * Which coins carry which tags. A coin is keyed the way the overview groups it: an underlying ID
 * (`eth`, `btc`; ADR 0019) or, for a coin outside the registry, its asset ref. The kind is copied
 * from the tag (enforced by the foreign key) so the database itself allows one category per coin.
 */
export const coinTags = pgTable(
  'coin_tags',
  {
    coinKey: text('coin_key').notNull(),
    tagId: uuid('tag_id').notNull(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.coinKey, t.tagId] }),
    foreignKey({ columns: [t.tagId, t.kind], foreignColumns: [tags.id, tags.kind] }).onDelete(
      'cascade',
    ),
    uniqueIndex('coin_tags_one_category').on(t.coinKey).where(sql`${t.kind} = 'category'`),
    index('coin_tags_tag_idx').on(t.tagId),
  ],
);
