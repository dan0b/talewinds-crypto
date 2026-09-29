import type { z } from 'zod';

/**
 * Validate environment variables against a schema. Pure: callers pass the
 * source (usually `process.env`). Fails with every problem listed at once so a
 * misconfigured deploy is obvious, and never echoes values (they may be secrets).
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined>,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
}
