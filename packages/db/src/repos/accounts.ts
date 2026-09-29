import { NewAccountInput, normalizeAccount } from '@talewinds/core';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { accounts, entities } from '../schema/index.ts';

export type AccountRow = typeof accounts.$inferSelect;

/** The single "self" entity that all owned accounts belong to. Created on first use. */
export async function ensureSelfEntity(db: Db): Promise<string> {
  const existing = await db.query.entities.findFirst({ where: eq(entities.kind, 'self') });
  if (existing) return existing.id;
  const [created] = await db
    .insert(entities)
    .values({ kind: 'self', name: 'Me' })
    .onConflictDoNothing()
    .returning({ id: entities.id });
  if (created) return created.id;
  // Lost a race with a concurrent insert; the row exists now.
  const row = await db.query.entities.findFirst({ where: eq(entities.kind, 'self') });
  if (!row) throw new Error('Could not create or find the self entity');
  return row.id;
}

/**
 * Register an account. Accepts unvalidated input (CLI args, API bodies) and
 * validates + normalizes it through @talewinds/core. Owned accounts are linked
 * to the self entity. Returns the existing row if the account is already known.
 */
export async function addAccount(
  db: Db,
  input: unknown,
): Promise<{ account: AccountRow; created: boolean }> {
  const normalized = normalizeAccount(NewAccountInput.parse(input));
  const entityId = normalized.ownership === 'owned' ? await ensureSelfEntity(db) : null;

  const [inserted] = await db
    .insert(accounts)
    .values({ ...normalized, entityId })
    .onConflictDoNothing({ target: accounts.ref })
    .returning();
  if (inserted) return { account: inserted, created: true };

  const existing = await db.query.accounts.findFirst({ where: eq(accounts.ref, normalized.ref) });
  if (!existing) throw new Error(`Account ${normalized.ref} vanished during insert`);
  return { account: existing, created: false };
}

export async function listAccounts(db: Db): Promise<AccountRow[]> {
  return db.select().from(accounts).orderBy(asc(accounts.ownership), asc(accounts.createdAt));
}
