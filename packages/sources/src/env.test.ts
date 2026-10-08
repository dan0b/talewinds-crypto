import { describe, expect, it } from 'vitest';
import { SourcesEnv } from './env.ts';

const PEM = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEE\n-----END EC PRIVATE KEY-----\n';

describe('SourcesEnv', () => {
  it('treats empty values as unset', () => {
    expect(SourcesEnv.parse({ ALCHEMY_API_KEY: '', COINBASE_API_KEY_NAME: '' })).toEqual({});
  });

  it('accepts a CDP key name and an ECDSA PEM key', () => {
    const env = SourcesEnv.parse({
      COINBASE_API_KEY_NAME: 'organizations/abc/apiKeys/def',
      COINBASE_API_PRIVATE_KEY: PEM,
    });
    expect(env.COINBASE_API_KEY_NAME).toBe('organizations/abc/apiKeys/def');
  });

  it('explains a wrong key format instead of failing later', () => {
    const r = SourcesEnv.safeParse({ COINBASE_API_PRIVATE_KEY: 'base64-ed25519-secret==' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/ECDSA PEM/);
    expect(SourcesEnv.safeParse({ COINBASE_API_KEY_NAME: 'my-key' }).success).toBe(false);
  });
});
