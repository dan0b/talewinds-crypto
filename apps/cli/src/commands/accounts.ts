import { CHAIN_KEYS, OWNERSHIPS, VENUES } from '@talewinds/core';
import { addAccount, listAccounts } from '@talewinds/db';
import { type Command, Option } from 'commander';
import { withRuntime } from '../context.ts';

interface AddOptions {
  chain?: string;
  venue?: string;
  ownership: string;
  label?: string;
}

export function registerAccountCommands(program: Command): void {
  const account = program.command('account').description('Manage wallets and venue accounts');

  account
    .command('add')
    .description('Register a wallet (--chain) or venue account (--venue)')
    .argument('[address]', 'wallet address (omit for Coinbase)')
    .addOption(new Option('--chain <chain>', 'chain the wallet lives on').choices(CHAIN_KEYS))
    .addOption(new Option('--venue <venue>', 'exchange/app account').choices(VENUES))
    .addOption(
      new Option('--ownership <ownership>', 'whose account this is')
        .choices(OWNERSHIPS)
        .default('owned'),
    )
    .option('--label <label>', 'friendly name')
    .addHelpText(
      'after',
      `
Examples:
  $ tw account add 0xabc… --chain robinhood --label trading
  $ tw account add 7xKX… --chain solana --ownership tracked --label "some KOL"
  $ tw account add 0xabc… --venue hyperliquid
  $ tw account add --venue coinbase --label main`,
    )
    .action(
      withRuntime(async (rt, address: string | undefined, opts: AddOptions) => {
        if (Boolean(opts.chain) === Boolean(opts.venue)) {
          throw new Error('Pass exactly one of --chain or --venue');
        }
        const input = opts.chain
          ? {
              kind: 'wallet',
              chain: opts.chain,
              address,
              ownership: opts.ownership,
              label: opts.label,
            }
          : {
              kind: 'venue',
              venue: opts.venue,
              address,
              ownership: opts.ownership,
              label: opts.label,
            };

        const { account, created } = await addAccount(rt.database.db, input);
        console.log(created ? 'Added' : 'Already registered', account.ref);
      }),
    );

  account
    .command('list')
    .description('List registered accounts')
    .action(
      withRuntime(async (rt) => {
        const rows = await listAccounts(rt.database.db);
        if (rows.length === 0) {
          console.log('No accounts yet. Add one with: tw account add --help');
          return;
        }
        console.table(
          rows.map((a) => ({
            ownership: a.ownership,
            kind: a.kind,
            label: a.label ?? '',
            ref: a.ref,
          })),
        );
      }),
    );
}
