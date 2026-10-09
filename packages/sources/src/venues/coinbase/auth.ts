import { createPrivateKey, type KeyObject, randomBytes, sign } from 'node:crypto';

/**
 * Coinbase request authentication (ADR 0017): one short-lived ES256 JWT per request, signed with
 * a **view-only** CDP API key. This signs token claims only; nothing here can build or sign a
 * transaction, and permission is checked with Coinbase before any read (see `index.ts`).
 */

export const COINBASE_HOST = 'api.coinbase.com';
/** Coinbase rejects tokens older than two minutes. */
const TOKEN_LIFETIME_SECONDS = 120;

export interface CoinbaseCredentials {
  /** `organizations/{org}/apiKeys/{id}`; not a secret, but kept out of logs anyway. */
  keyName: string;
  /** The PEM private key from env. Never logged, stored, or included in errors. */
  privateKeyPem: string;
}

const base64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');

/** Parse and check the key: it must be ECDSA on P-256 (Coinbase's ES256), never Ed25519. */
function loadKey(pem: string): KeyObject {
  let key: KeyObject;
  try {
    // .env files often carry the PEM with literal "\n" sequences instead of newlines.
    key = createPrivateKey(pem.replace(/\\n/g, '\n').trim());
  } catch {
    throw new Error('COINBASE_API_PRIVATE_KEY could not be read as a PEM private key');
  }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error(
      'COINBASE_API_PRIVATE_KEY must be an ECDSA (P-256) key. Create the Coinbase key with the ECDSA signature algorithm, not Ed25519.',
    );
  }
  return key;
}

/**
 * Returns `(method, path) → headers` for `ProviderClient`'s `authorize` option. The key is parsed
 * on first use, so a process that never calls Coinbase (the API server) never loads it.
 */
export function coinbaseAuthorizer(
  credentials: CoinbaseCredentials,
  options: { now?: () => number } = {},
): (method: string, path: string) => Record<string, string> {
  let key: KeyObject | null = null;
  return (method, path) => {
    key ??= loadKey(credentials.privateKeyPem);
    const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
    const header = {
      alg: 'ES256',
      kid: credentials.keyName,
      nonce: randomBytes(16).toString('hex'),
      typ: 'JWT',
    };
    const claims = {
      iss: 'cdp',
      sub: credentials.keyName,
      nbf: now,
      exp: now + TOKEN_LIFETIME_SECONDS,
      // Method, host, and path; the query string isn't part of the signed URI.
      uri: `${method.toUpperCase()} ${COINBASE_HOST}${path.split('?')[0]}`,
    };
    const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
    const signature = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
    return { authorization: `Bearer ${input}.${base64url(signature)}` };
  };
}
