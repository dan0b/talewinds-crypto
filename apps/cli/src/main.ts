import { Command } from 'commander';
import { registerAccountCommands } from './commands/accounts.ts';
import { registerSystemCommands } from './commands/system.ts';

const program = new Command()
  .name('tw')
  .description('Talewinds operations CLI')
  .showHelpAfterError();

registerSystemCommands(program);
registerAccountCommands(program);

await program.parseAsync();
