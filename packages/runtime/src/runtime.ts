import { createDatabase, type Database } from '@talewinds/db';
import type { z } from 'zod';
import { BaseEnv, loadEnv } from './env.ts';
import { createLogger, type Logger } from './logger.ts';

export interface Runtime<E> {
  env: E;
  log: Logger;
  database: Database;
  /** Register cleanup to run (in reverse order) on SIGINT/SIGTERM or `shutdown()`. */
  onShutdown(fn: () => Promise<void> | void): void;
  shutdown(exitCode?: number): Promise<void>;
}

/**
 * The one way a Node process (api, worker, cli) starts: validated env, logger,
 * database connection, and orderly shutdown. Keeps every entry point identical.
 */
export function startRuntime<S extends z.ZodObject = typeof BaseEnv>(options: {
  name: string;
  env?: S;
  /** Where logs go. The CLI uses stderr so stdout carries only command output. */
  logDestination?: 'stdout' | 'stderr';
}): Runtime<z.infer<S>> {
  const env = loadEnv((options.env ?? BaseEnv) as S) as z.infer<S> & BaseEnv;
  const log = createLogger(options.name, {
    level: env.LOG_LEVEL,
    pretty: env.NODE_ENV !== 'production',
    ...(options.logDestination ? { destination: options.logDestination } : {}),
  });
  const database = createDatabase(env.DATABASE_URL, {
    applicationName: `talewinds-${options.name}`,
  });

  const cleanups: Array<() => Promise<void> | void> = [() => database.close()];
  let shuttingDown = false;

  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const fn of cleanups.reverse()) {
      try {
        await fn();
      } catch (err) {
        log.error({ err }, 'error during shutdown');
      }
    }
    log.flush();
    process.exitCode = exitCode;
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      log.info({ signal }, 'shutting down');
      void shutdown(0);
    });
  }

  return {
    env,
    log,
    database,
    onShutdown: (fn) => cleanups.push(fn),
    shutdown,
  };
}
