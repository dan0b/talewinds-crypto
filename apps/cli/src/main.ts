import { Command } from 'commander';
import { registerAccountCommands } from './commands/accounts.ts';
import { registerPortfolioCommands } from './commands/portfolio.ts';
import { registerSystemCommands } from './commands/system.ts';
import { registerWalletCommands } from './commands/wallets.ts';

const program = new Command()
  .name('tw')
  .description('Talewinds operations CLI')
  .showHelpAfterError();

registerSystemCommands(program);
registerWalletCommands(program);
registerAccountCommands(program);
registerPortfolioCommands(program);

await program.parseAsync();
