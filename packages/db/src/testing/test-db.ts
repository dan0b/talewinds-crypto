import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { createDatabase, type Database, type Db, runMigrations } from '../client.ts';

/** Test-only helpers for integration tests against the `talewinds_test` database. */

const ROOT_ENV = fileURLToPath(new URL('../../../../.env', import.meta.url));

/** DATABASE_URL with the database name swapped for `talewinds_test`. Never the dev database. */
export function testDatabaseUrl(): string {
  if (!process.env.DATABASE_URL && existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base)
    throw new Error('DATABASE_URL (or TEST_DATABASE_URL) is required for integration tests');
  const url = new URL(base);
  if (!process.env.TEST_DATABASE_URL) url.pathname = '/talewinds_test';
  if (url.pathname === '/talewinds')
    throw new Error('Refusing to run integration tests against the dev database');
  return url.toString();
}

export function createTestDatabase(): Database {
  return createDatabase(testDatabaseUrl(), { applicationName: 'talewinds-tests' });
}

/** Empty every application table (TRUNCATE doesn't fire the raw_records insert-only trigger). */
export async function resetDatabase(db: Db): Promise<void> {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows.map((r) => `"public"."${r.tablename}"`);
  if (names.length > 0)
    await db.execute(sql.raw(`truncate ${names.join(', ')} restart identity cascade`));
}

/** Create the test database if it doesn't exist, then apply every migration. Idempotent. */
export async function ensureTestDatabase(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const dbName = decodeURIComponent(url.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('select 1 from pg_database where datname = $1', [dbName]);
    if (exists.rowCount === 0)
      await client.query(`create database "${dbName.replaceAll('"', '')}"`);
  } finally {
    await client.end();
  }

  const database = createDatabase(url.toString());
  try {
    await runMigrations(database.db);
  } finally {
    await database.close();
  }
}
