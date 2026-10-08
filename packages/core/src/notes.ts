/**
 * A machine-readable remark attached to a result: something that couldn't be seen, was
 * skipped, or is approximate. Surfaced to the user rather than silently dropped.
 */
export interface Note {
  /** Stable identifier, e.g. `token_discovery_unavailable`, `no_decimals`. */
  code: string;
  /** Human-readable explanation. Must not contain secrets. */
  message: string;
}
