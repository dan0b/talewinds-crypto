import { type BaseEnv, type Runtime, startRuntime } from '@talewinds/runtime';
import { ZodError } from 'zod';

/**
 * Wrap a command so it gets a runtime (env, db, logger) and always shuts it
 * down. The runtime starts lazily, so `tw --help` works without a database.
 */
export function withRuntime<A extends unknown[]>(
  fn: (rt: Runtime<BaseEnv>, ...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    const rt = startRuntime({ name: 'cli', logDestination: 'stderr' });
    try {
      await fn(rt, ...args);
      await rt.shutdown(0);
    } catch (err) {
      printError(err);
      await rt.shutdown(1);
    }
  };
}

function printError(err: unknown): void {
  if (err instanceof ZodError) {
    console.error('Invalid input:');
    for (const issue of err.issues) {
      console.error(`  - ${issue.path.join('.') || '(input)'}: ${issue.message}`);
    }
    return;
  }
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
}
