import { z } from 'zod';

// `.env` files often contain `KEY=` for unset values; treat empty strings as "not set".
const unsetIfEmpty = (v: unknown) => (v === '' ? undefined : v);
const optionalSecret = z.preprocess(unsetIfEmpty, z.string().min(1).optional());
const optionalUrl = z.preprocess(unsetIfEmpty, z.url({ protocol: /^https?$/ }).optional());

/**
 * Provider configuration. Everything is optional: without keys, adapters fall back to free
 * public endpoints and report what they couldn't see. Apps merge this into their env schema.
 */
export const SourcesEnv = z.object({
  /**
   * Needed for Robinhood Chain token balances (the app must have Robinhood Chain Mainnet enabled).
   * Used only for token discovery; native balances come from the public or custom RPC.
   */
  ALCHEMY_API_KEY: optionalSecret,
  /** Overrides for RPC endpoints (e.g. a Helius URL for Solana). May contain keys. */
  ETHEREUM_RPC_URL: optionalUrl,
  ROBINHOOD_RPC_URL: optionalUrl,
  SOLANA_RPC_URL: optionalUrl,
  /**
   * Coinbase CDP secret API key (step 02), created with **View** permission only and the ECDSA
   * signature algorithm. The name looks like `organizations/{org}/apiKeys/{id}`.
   */
  COINBASE_API_KEY_NAME: z.preprocess(
    unsetIfEmpty,
    z
      .string()
      .regex(
        /^organizations\/[^/\s]+\/apiKeys\/[^/\s]+$/,
        'COINBASE_API_KEY_NAME should look like organizations/{org_id}/apiKeys/{key_id}',
      )
      .optional(),
  ),
  /** The key's PEM private key, pasted in double quotes (newlines or \\n both work). */
  COINBASE_API_PRIVATE_KEY: z.preprocess(
    unsetIfEmpty,
    z
      .string()
      .regex(
        /-----BEGIN (EC )?PRIVATE KEY-----[\s\S]+-----END (EC )?PRIVATE KEY-----/,
        'COINBASE_API_PRIVATE_KEY should be the ECDSA PEM key (-----BEGIN EC PRIVATE KEY----- …). Ed25519 keys are not supported by the Coinbase App API.',
      )
      .optional(),
  ),
});
export type SourcesEnv = z.infer<typeof SourcesEnv>;
