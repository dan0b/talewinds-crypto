import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, resetDatabase } from '../testing/test-db.ts';
import {
  type AssetInput,
  assetStatusHistoryFor,
  findAssetByRef,
  promoteToVerified,
  setAssetStatusManually,
  upsertAssets,
} from './assets.ts';

const { db, close } = createTestDatabase();
beforeEach(() => resetDatabase(db));
afterAll(() => close());

const token = (overrides: Partial<AssetInput> = {}): AssetInput => ({
  ref: 'eip155:1/erc20:0x0000000000000000000000000000000000000001',
  chainId: 'eip155:1',
  kind: 'token',
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'TKN',
  name: 'Token',
  decimals: 18,
  decimalsSource: 'blockscout',
  metadataSource: 'blockscout',
  initialStatus: 'unverified',
  ...overrides,
});

describe('upsertAssets', () => {
  it('never changes decimals or status of a known asset, and keeps metadata when a provider sends none', async () => {
    await upsertAssets(db, [token()]);
    const rows = await upsertAssets(db, [
      token({ decimals: 6, symbol: null, name: 'Renamed', initialStatus: 'verified' }),
    ]);
    const row = rows.get(token().ref);
    expect(row).toMatchObject({
      decimals: 18,
      symbol: 'TKN',
      name: 'Renamed',
      status: 'unverified',
    });
  });

  it('deduplicates repeated refs in one call', async () => {
    const rows = await upsertAssets(db, [token(), token()]);
    expect(rows.size).toBe(1);
  });
});

describe('asset status', () => {
  it('promotes unverified assets automatically and records why', async () => {
    const id = (await upsertAssets(db, [token()])).get(token().ref)?.id as string;
    expect(await promoteToVerified(db, [id], 'priced')).toEqual([id]);
    expect((await findAssetByRef(db, token().ref))?.status).toBe('verified');
    const history = await assetStatusHistoryFor(db, id);
    expect(history.map((h) => [h.status, h.source, h.reason])).toEqual([
      ['verified', 'auto', 'priced'],
    ]);
  });

  it('lets manual decisions win over automatic rules, keeping the full history', async () => {
    const id = (await upsertAssets(db, [token()])).get(token().ref)?.id as string;
    await setAssetStatusManually(db, id, 'spam', 'airdrop scam');
    expect(await promoteToVerified(db, [id], 'priced')).toEqual([]); // manual spam stays spam
    const row = await findAssetByRef(db, token().ref);
    expect(row).toMatchObject({ status: 'spam', statusSource: 'manual' });
    await setAssetStatusManually(db, id, 'verified', 'actually legit');
    const history = await assetStatusHistoryFor(db, id);
    expect(history.map((h) => h.status)).toEqual(['spam', 'verified']);
  });
});
