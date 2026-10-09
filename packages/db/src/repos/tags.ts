import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db, Executor } from '../client.ts';
import { coinTags, tags } from '../schema/index.ts';

export type TagRow = typeof tags.$inferSelect;
export type CoinTagRow = typeof coinTags.$inferSelect;
export type TagKind = 'category' | 'theme';

/** Postgres's code for a unique violation (e.g. a second tag with the same name). */
const isUniqueViolation = (err: unknown) =>
  (err as { cause?: { code?: string }; code?: string })?.code === '23505' ||
  (err as { cause?: { code?: string } })?.cause?.code === '23505';

export async function listTags(db: Executor): Promise<TagRow[]> {
  return db.select().from(tags).orderBy(asc(tags.kind), asc(tags.name));
}

export async function listCoinTags(db: Executor): Promise<CoinTagRow[]> {
  return db.select().from(coinTags);
}

/** Create a tag. Throws `A … named … already exists` for a duplicate name (any case). */
export async function createTag(db: Executor, kind: TagKind, name: string): Promise<TagRow> {
  try {
    const [row] = await db.insert(tags).values({ kind, name }).returning();
    if (!row) throw new Error('Could not create the tag');
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error(`A ${kind} named "${name}" already exists`);
    throw err;
  }
}

/** Rename a tag; its coins keep it. Throws `Unknown tag` or a duplicate-name error. */
export async function renameTag(db: Executor, id: string, name: string): Promise<TagRow> {
  try {
    const [row] = await db.update(tags).set({ name }).where(eq(tags.id, id)).returning();
    if (!row) throw new Error(`Unknown tag ${id}`);
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error(`Another tag is already named "${name}"`);
    throw err;
  }
}

/** Delete a tag; it's removed from every coin (cascade). Throws `Unknown tag`. */
export async function deleteTag(db: Executor, id: string): Promise<void> {
  const rows = await db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id });
  if (rows.length === 0) throw new Error(`Unknown tag ${id}`);
}

/** Tags by ID, checked to be of one kind. Throws `Unknown tag` for any that isn't. */
async function tagsOfKind(db: Executor, ids: string[], kind: TagKind): Promise<TagRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(tags)
    .where(and(inArray(tags.id, ids), eq(tags.kind, kind)));
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.find((id) => !found.has(id));
  if (missing) throw new Error(`Unknown tag ${missing} (expected a ${kind})`);
  return rows;
}

/** Set a coin's category, replacing any previous one; null clears it. */
export async function setCoinCategory(db: Db, coinKey: string, tagId: string | null) {
  await db.transaction(async (tx) => {
    if (tagId) await tagsOfKind(tx, [tagId], 'category');
    await tx
      .delete(coinTags)
      .where(and(eq(coinTags.coinKey, coinKey), eq(coinTags.kind, 'category')));
    if (tagId) await tx.insert(coinTags).values({ coinKey, tagId, kind: 'category' });
  });
}

/** Set a coin's themes to exactly these (an empty list clears them). */
export async function setCoinThemes(db: Db, coinKey: string, tagIds: string[]) {
  const unique = [...new Set(tagIds)];
  await db.transaction(async (tx) => {
    await tagsOfKind(tx, unique, 'theme');
    await tx.delete(coinTags).where(and(eq(coinTags.coinKey, coinKey), eq(coinTags.kind, 'theme')));
    if (unique.length > 0) {
      await tx
        .insert(coinTags)
        .values(unique.map((tagId) => ({ coinKey, tagId, kind: 'theme' as const })));
    }
  });
}
