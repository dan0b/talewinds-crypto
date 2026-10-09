import { CHAIN_KEYS } from '@talewinds/core';
import { type Db, findWalletById, listAccounts, listWallets, type WalletRow } from '@talewinds/db';
import { addWallet, removeWallet, renameWallet } from '@talewinds/portfolio';
import type { Command } from 'commander';
import { withRuntime } from '../context.ts';

/**
 * The one wallet a target names: its ID, or its address (as stored: EVM and bech32 lowercase,
 * base58 exact). The same address can exist in two families (a Bitcoin address once added as
 * Solana), so an ambiguous address is refused rather than guessed.
 */
async function findOneWallet(db: Db, target: string): Promise<WalletRow> {
  const byId = await findWalletById(db, target).catch(() => null);
  if (byId) return byId;
  const t = target.trim();
  const matches = (await listWallets(db)).filter(
    (w) => w.address === t || w.address === t.toLowerCase(),
  );
  const [only] = matches;
  if (!only) throw new Error(`No wallet matches ${target}`);
  if (matches.length > 1) {
    const list = matches.map((w) => `${w.name ?? '(unnamed)'} (${w.family}): ${w.id}`).join('; ');
    throw new Error(`${matches.length} wallets use that address. Name one by its ID: ${list}`);
  }
  return only;
}

export function registerWalletCommands(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Manage your wallets (one address, every chain of its family)');

  wallet
    .command('add')
    .description('Add a wallet; EVM wallets are tracked on every supported EVM chain by default')
    .argument('<address>', 'EVM 0x…, Solana, or Bitcoin (bc1…, 1…, 3…) address')
    .option('--name <name>', 'what to call it')
    .option('--chains <chains>', `comma-separated subset of: ${CHAIN_KEYS.join(', ')}`)
    .addHelpText(
      'after',
      `
Examples:
  $ tw wallet add 0xabc… --name Trading          # Ethereum + Robinhood Chain
  $ tw wallet add 0xabc… --chains robinhood     # Robinhood Chain only
  $ tw wallet add 7xKX… --name Degen             # Solana
  $ tw wallet add bc1p… --name "Xverse · ordinals"  # Bitcoin
Run \`tw sync\` afterwards (the dashboard does this for you).`,
    )
    .action(
      withRuntime(async (rt, address: string, opts: { name?: string; chains?: string }) => {
        const chains = opts.chains
          ?.split(',')
          .map((c) => c.trim())
          .filter(Boolean);
        const {
          wallet: w,
          accounts,
          created,
        } = await addWallet(rt.database.db, {
          address,
          name: opts.name ?? null,
          ...(chains ? { chains } : {}),
        });
        console.log(
          `${created ? 'Added' : 'Already known:'} ${w.name ?? '(unnamed)'} ${w.address} on ${accounts.length} chain(s)`,
        );
      }),
    );

  wallet
    .command('rename')
    .description('Name (or, with an empty name, un-name) a wallet')
    .argument('<wallet>', 'wallet address or ID')
    .argument('<name>', 'new name ("" to clear)')
    .action(
      withRuntime(async (rt, target: string, name: string) => {
        const db = rt.database.db;
        const match = await findOneWallet(db, target);
        const row = await renameWallet(db, match.id, name);
        console.log(`Renamed ${row.address} to ${row.name ?? '(unnamed)'}`);
      }),
    );

  wallet
    .command('remove')
    .description('Remove a wallet, its accounts, and their sync history (raw records are kept)')
    .argument('<wallet>', 'wallet address or ID')
    .option('--yes', 'really remove it (without this, only shows what would be removed)')
    .action(
      withRuntime(async (rt, target: string, opts: { yes?: boolean }) => {
        const db = rt.database.db;
        const w = await findOneWallet(db, target);
        const chains = (await listAccounts(db))
          .filter((a) => a.walletId === w.id)
          .map((a) => a.chainId);
        const label = `${w.name ?? '(unnamed)'} (${w.family}, ${w.address})`;
        if (!opts.yes) {
          console.log(
            `Would remove ${label} and its ${chains.length} account(s) [${chains.join(', ')}] with their balance history. Run again with --yes to remove it.`,
          );
          return;
        }
        const { accounts } = await removeWallet(db, w.id);
        console.log(`Removed ${label} and ${accounts} account(s).`);
      }),
    );

  wallet
    .command('list')
    .description('List wallets and the chains each is tracked on')
    .action(
      withRuntime(async (rt) => {
        const [wallets, accounts] = await Promise.all([
          listWallets(rt.database.db),
          listAccounts(rt.database.db),
        ]);
        if (wallets.length === 0) {
          console.log('No wallets yet. Add one with: pnpm tw wallet add --help');
          return;
        }
        console.table(
          wallets.map((w) => ({
            name: w.name ?? '',
            family: w.family,
            address: w.address,
            chains: accounts
              .filter((a) => a.walletId === w.id)
              .map((a) => a.chainId)
              .join(', '),
          })),
        );
      }),
    );
}
