import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { rawRecords } from '../schema/index.ts';
import { createTestDatabase, resetDatabase } from '../testing/test-db.ts';
import { saveRawRecords } from './raw.ts';

const { db, close } = createTestDatabase();
beforeEach(() => resetDatabase(db));
afterAll(() => close());

const capture = (requestKey: string, payload: unknown) => ({
  provider: 'test',
  requestKey,
  payload,
  fetchedAt: new Date(),
});

describe('saveRawRecords', () => {
  it('stores identical responses once and returns ids in input order', async () => {
    const [a, b, c] = await saveRawRecords(db, [
      capture('GET /x', { v: 1 }),
      capture('GET /y', { v: 1 }),
      capture('GET /x', { v: 1 }),
    ]);
    expect(a).toBe(c);
    expect(a).not.toBe(b); // same content, different request: separate provenance
    const [again] = await saveRawRecords(db, [capture('GET /x', { v: 1 })]);
    expect(again).toBe(a);
    const count = await db.$count(rawRecords);
    expect(count).toBe(2);
  });

  it('treats key order as irrelevant to identity', async () => {
    const [a] = await saveRawRecords(db, [capture('GET /x', { a: 1, b: 2 })]);
    const [b] = await saveRawRecords(db, [capture('GET /x', { b: 2, a: 1 })]);
    expect(a).toBe(b);
  });

  it('handles request keys longer than a btree index entry allows (regression)', async () => {
    const longKey = `GET /prices/current/${'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v,'.repeat(60)}`;
    expect(longKey.length).toBeGreaterThan(2704);
    const [id] = await saveRawRecords(db, [capture(longKey, { coins: {} })]);
    expect(id).toBeDefined();
  });

  it('stores payloads containing U+0000, which jsonb rejects, with a replacement character', async () => {
    const [id] = await saveRawRecords(db, [capture('GET /nul', { name: 'bad\u0000name' })]);
    const [row] = await db
      .select()
      .from(rawRecords)
      .where(eq(rawRecords.id, id as string));
    expect(row?.payload).toEqual({ name: 'bad�name' });
  });

  it('is insert-only: the database rejects updates and deletes', async () => {
    const [id] = await saveRawRecords(db, [capture('GET /x', { v: 1 })]);
    await expect(
      db.execute(sql`update raw_records set provider = 'x' where id = ${id}`),
    ).rejects.toThrow();
    await expect(db.execute(sql`delete from raw_records where id = ${id}`)).rejects.toThrow();
  });
});
