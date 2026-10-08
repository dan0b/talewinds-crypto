/**
 * A short, safe description of an error. Drizzle wraps driver errors as
 * "Failed query: <sql> params: <values>", which can be tens of kilobytes and contains stored data;
 * report the underlying database error instead. Other errors pass through unchanged.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error && err.message.startsWith('Failed query:')) {
    return err.cause instanceof Error ? `database error: ${err.cause.message}` : 'database error';
  }
  return err instanceof Error ? err.message : String(err);
}
