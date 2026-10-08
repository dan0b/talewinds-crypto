/**
 * A provider call failed. Messages are safe to show and store: they never contain URLs
 * (which may embed API keys), headers, or credentials.
 */
export class ProviderError extends Error {
  readonly provider: string;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(`${provider}: ${message}`);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}
