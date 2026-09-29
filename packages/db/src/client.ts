import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema/index.ts';

export type Db = NodePgDatabase<typeof schema>;

export interface Database {
  db: Db;
  close(): Promise<void>;
}

export function createDatabase(url: string, options: { applicationName?: string } = {}): Database {
  const pool = new pg.Pool({
    connectionString: url,
    ...(options.applicationName ? { application_name: options.applicationName } : {}),
  });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

/** Round-trip latency to Postgres, in milliseconds. Throws if unreachable. */
export async function pingDatabase(db: Db): Promise<number> {
  const started = performance.now();
  await db.execute(sql`select 1`);
  return Math.round(performance.now() - started);
}
