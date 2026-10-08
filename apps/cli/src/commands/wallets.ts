import { CHAIN_KEYS, detectChainFamily, normalizeAddress } from '@talewinds/core';
import { findWalletById, listAccounts, listWallets } from '@talewinds/db';
import { addWallet, renameWallet } from '@talewinds/portfolio';
import type { Command } from 'commander';
import { withRuntime } from '../context.ts';

export function registerWalletCommands(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Manage your wallets (one address, every chain of its family)');

  wallet
    .command('add')
    .description('Add a wallet; EVM wallets are tracked on every supported EVM chain by default')
    .argument('<address>', 'EVM 0x… or Solana address')
    .option('--name <name>', 'what to call it')
    .option('--chains <chains>', `comma-separated subset of: ${CHAIN_KEYS.join(', ')}`)
    .addHelpText(
      'after',
      `
Examples:
  $ tw wallet add 0xabc… --name Trading          # Ethereum + Robinhood Chain
  $ tw wallet add 0xabc… --chains robinhood     # Robinhood Chain only
  $ tw wallet add 7xKX… --name Degen             # Solana
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
        const wallets = await listWallets(db);
        const family = detectChainFamily(target);
        const match =
          (await findWalletById(db, target).catch(() => null)) ??
          (family
            ? wallets.find((w) => w.address === normalizeAddress(family, target))
            : undefined);
        if (!match) throw new Error(`No wallet matches ${target}`);
        const row = await renameWallet(db, match.id, name);
        console.log(`Renamed ${row.address} to ${row.name ?? '(unnamed)'}`);
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
