import { type NewWalletInput, normalizeWallet, WalletName } from '@talewinds/core';
import { asc, eq } from 'drizzle-orm';
import type { Db, Executor } from '../client.ts';
import { wallets } from '../schema/index.ts';
import { type AccountRow, addAccount, ensureWallet, type WalletRow } from './accounts.ts';

/**
 * Add a wallet and an account for each chain it should be tracked on (by default every chain of
 * its family). Idempotent: an existing wallet or account is reused, and a name is only applied to
 * a wallet that doesn't have one yet.
 */
export async function addWallet(
  db: Db,
  input: NewWalletInput,
): Promise<{ wallet: WalletRow; accounts: AccountRow[]; created: boolean }> {
  const w = normalizeWallet(input);
  const { wallet, created } = await ensureWallet(db, w.family, w.address, w.name);
  const rows: AccountRow[] = [];
  for (const chain of w.chains) {
    const { account } = await addAccount(db, {
      kind: 'wallet',
      chain,
      address: w.address,
      ownership: w.ownership,
    });
    rows.push(account);
  }
  return { wallet, accounts: rows, created };
}

/** Set (or clear, with null) a wallet's name. */
export async function renameWallet(db: Db, walletId: string, name: unknown): Promise<WalletRow> {
  const clean = WalletName.parse(name) || null;
  const [row] = await db
    .update(wallets)
    .set({ name: clean })
    .where(eq(wallets.id, walletId))
    .returning();
  if (!row) throw new Error(`Unknown wallet ${walletId}`);
  return row;
}

export async function listWallets(db: Executor): Promise<WalletRow[]> {
  return db.select().from(wallets).orderBy(asc(wallets.createdAt));
}

export async function findWalletById(db: Executor, id: string): Promise<WalletRow | null> {
  const [row] = await db.select().from(wallets).where(eq(wallets.id, id));
  return row ?? null;
}
