import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { coinTags } from '../schema/index.ts';
import { createTestDatabase, resetDatabase } from '../testing/test-db.ts';
import {
  createTag,
  deleteTag,
  listCoinTags,
  listTags,
  renameTag,
  setCoinCategory,
  setCoinThemes,
} from './tags.ts';

const { db, close } = createTestDatabase();
beforeEach(() => resetDatabase(db));
afterAll(() => close());

const HOOKR = 'eip155:4663/erc20:0x18e674231a58c239dc7daedcffe15ec3a24cff5c';

describe('categories and themes', () => {
  it('keeps names unique per kind, ignoring case, but allows the same name across kinds', async () => {
    await createTag(db, 'category', 'Major');
    await expect(createTag(db, 'category', 'major')).rejects.toThrow(
      'A category named "major" already exists',
    );
    await createTag(db, 'theme', 'Major'); // a theme may share a category's name
    expect((await listTags(db)).map((t) => [t.kind, t.name])).toEqual([
      ['category', 'Major'],
      ['theme', 'Major'],
    ]);
  });

  it('gives a coin at most one category; setting another replaces it', async () => {
    const major = await createTag(db, 'category', 'Major');
    const spec = await createTag(db, 'category', 'Speculative');
    await setCoinCategory(db, HOOKR, major.id);
    await setCoinCategory(db, HOOKR, spec.id);
    expect((await listCoinTags(db)).map((r) => r.tagId)).toEqual([spec.id]);
    await setCoinCategory(db, HOOKR, null);
    expect(await listCoinTags(db)).toEqual([]);
  });

  it('enforces one category per coin and matching kinds in the database itself', async () => {
    const major = await createTag(db, 'category', 'Major');
    const spec = await createTag(db, 'category', 'Speculative');
    const hooks = await createTag(db, 'theme', 'V4 Hooks');
    await db.insert(coinTags).values({ coinKey: 'eth', tagId: major.id, kind: 'category' });
    await expect(
      db.insert(coinTags).values({ coinKey: 'eth', tagId: spec.id, kind: 'category' }),
    ).rejects.toThrow();
    // A theme can't be stored as a category: the kind must match the tag's.
    await expect(
      db.insert(coinTags).values({ coinKey: 'btc', tagId: hooks.id, kind: 'category' }),
    ).rejects.toThrow();
  });

  it('sets themes exactly, refuses unknown or wrong-kind tags, and keeps them through a rename', async () => {
    const hooks = await createTag(db, 'theme', 'V4 Hooks');
    const ai = await createTag(db, 'theme', 'AI');
    const major = await createTag(db, 'category', 'Major');
    await setCoinThemes(db, HOOKR, [hooks.id, ai.id, hooks.id]);
    expect((await listCoinTags(db)).map((r) => r.tagId).sort()).toEqual([hooks.id, ai.id].sort());
    await setCoinThemes(db, HOOKR, [hooks.id]);
    expect((await listCoinTags(db)).map((r) => r.tagId)).toEqual([hooks.id]);

    await expect(setCoinThemes(db, HOOKR, [major.id])).rejects.toThrow('expected a theme');
    await expect(setCoinCategory(db, HOOKR, hooks.id)).rejects.toThrow('expected a category');
    // A refused change leaves the coin as it was.
    expect((await listCoinTags(db)).map((r) => r.tagId)).toEqual([hooks.id]);

    await renameTag(db, hooks.id, 'Uniswap V4 Hooks');
    expect((await listCoinTags(db)).map((r) => r.tagId)).toEqual([hooks.id]);
  });

  it('removes a deleted tag from every coin', async () => {
    const hooks = await createTag(db, 'theme', 'V4 Hooks');
    await setCoinThemes(db, HOOKR, [hooks.id]);
    await setCoinThemes(db, 'eth', [hooks.id]);
    await deleteTag(db, hooks.id);
    expect(await listCoinTags(db)).toEqual([]);
    await expect(deleteTag(db, hooks.id)).rejects.toThrow('Unknown tag');
  });
});
