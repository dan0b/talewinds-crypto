import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from '@talewinds/core';
import { z } from 'zod';

/** Walk up from this file to the directory containing pnpm-workspace.yaml. */
export function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Could not locate the repo root (pnpm-workspace.yaml)');
    dir = parent;
  }
  return dir;
}

/**
 * Load `<repo root>/.env` if present. Variables already set in the real
 * environment win, so deployed hosts can ignore the file entirely.
 */
export function loadRootEnvFile(): void {
  const file = join(findRepoRoot(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

/** Variables every process needs. Apps extend this with their own. */
export const BaseEnv = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});
export type BaseEnv = z.infer<typeof BaseEnv>;

export function loadEnv<S extends z.ZodObject>(schema: S): z.infer<S> {
  loadRootEnvFile();
  return parseEnv(schema, process.env);
}
