import { CHAINS, NewAccountInput, normalizeAccount } from '@talewinds/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db, Executor } from '../client.ts';
import { accounts, entities, wallets } from '../schema/index.ts';

export type AccountRow = typeof accounts.$inferSelect;
export type WalletRow = typeof wallets.$inferSelect;

/** The single "self" entity that all owned accounts belong to. Created on first use. */
export async function ensureSelfEntity(db: Executor): Promise<string> {
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
 * The wallet for an address, created on first use. A name is applied only if the wallet has none
 * yet (renaming is `renameWallet`). Returns the row and whether it was just created.
 */
export async function ensureWallet(
  db: Executor,
  family: 'evm' | 'solana',
  address: string,
  name: string | null,
): Promise<{ wallet: WalletRow; created: boolean }> {
  const [inserted] = await db
    .insert(wallets)
    .values({ family, address, name })
    .onConflictDoNothing({ target: [wallets.family, wallets.address] })
    .returning();
  if (inserted) return { wallet: inserted, created: true };

  const [existing] = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.family, family), eq(wallets.address, address)));
  if (!existing) throw new Error(`Wallet ${family}:${address} vanished during insert`);
  if (name && !existing.name) {
    const [named] = await db
      .update(wallets)
      .set({ name })
      .where(and(eq(wallets.id, existing.id), isNull(wallets.name)))
      .returning();
    return { wallet: named ?? existing, created: false };
  }
  return { wallet: existing, created: false };
}

/**
 * Register one account. Accepts unvalidated input (CLI args, API bodies) and validates +
 * normalizes it through @talewinds/core. Wallet accounts are attached to their wallet (created if
 * needed; a label names a still-unnamed wallet). Owned accounts are linked to the self entity.
 * Returns the existing row if the account is already known.
 */
export async function addAccount(
  db: Db,
  input: unknown,
): Promise<{ account: AccountRow; created: boolean }> {
  const normalized = normalizeAccount(NewAccountInput.parse(input));
  return db.transaction(async (tx) => {
    const entityId = normalized.ownership === 'owned' ? await ensureSelfEntity(tx) : null;

    let walletId: string | null = null;
    if (normalized.kind === 'wallet' && normalized.chainId && normalized.address) {
      const chain = Object.values(CHAINS).find((c) => c.id === normalized.chainId);
      if (!chain) throw new Error(`Unsupported chain ${normalized.chainId}`);
      walletId = (await ensureWallet(tx, chain.family, normalized.address, normalized.label)).wallet
        .id;
    }

    const [inserted] = await tx
      .insert(accounts)
      .values({ ...normalized, entityId, walletId })
      .onConflictDoNothing({ target: accounts.ref })
      .returning();
    if (inserted) return { account: inserted, created: true };

    const existing = await tx.query.accounts.findFirst({ where: eq(accounts.ref, normalized.ref) });
    if (!existing) throw new Error(`Account ${normalized.ref} vanished during insert`);
    return { account: existing, created: false };
  });
}

export async function listAccounts(db: Executor): Promise<AccountRow[]> {
  return db.select().from(accounts).orderBy(asc(accounts.ownership), asc(accounts.createdAt));
}

export async function findAccountByRef(db: Executor, ref: string): Promise<AccountRow | null> {
  const row = await db.query.accounts.findFirst({ where: eq(accounts.ref, ref) });
  return row ?? null;
}
