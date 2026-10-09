import {
  type AccountRow,
  addWallet as addWalletRow,
  type Db,
  removeWallet as removeWalletRow,
  renameWallet as renameWalletRow,
  type WalletRow,
} from '@talewinds/db';

/**
 * Add a wallet (and an account per chain it's tracked on). Adding an address that's already known
 * is safe: missing chains are added, existing accounts and names are kept.
 */
export async function addWallet(
  db: Db,
  input: unknown,
): Promise<{ wallet: WalletRow; accounts: AccountRow[]; created: boolean }> {
  // Validation and family detection happen in @talewinds/core via the repo.
  return addWalletRow(db, input as Parameters<typeof addWalletRow>[1]);
}

/** Name (or, with null/empty, un-name) a wallet. */
export async function renameWallet(db: Db, walletId: string, name: unknown): Promise<WalletRow> {
  return renameWalletRow(db, walletId, name);
}

/**
 * Remove a wallet, its accounts, and their sync history (step 02d). Raw records stay. Adding the
 * address again starts it fresh.
 */
export async function removeWallet(
  db: Db,
  walletId: string,
): Promise<{ wallet: WalletRow; accounts: number }> {
  return removeWalletRow(db, walletId);
}
