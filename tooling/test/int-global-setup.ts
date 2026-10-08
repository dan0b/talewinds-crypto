/**
 * Runs once before integration tests: make sure the `talewinds_test` database exists and is fully
 * migrated. Tests reset tables themselves (see packages/db/src/testing/test-db.ts).
 */
import { ensureTestDatabase } from '../../packages/db/src/testing/test-db.ts';

export default async function setup(): Promise<void> {
  await ensureTestDatabase();
}
