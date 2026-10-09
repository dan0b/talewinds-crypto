import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { accounts, balanceSnapshots, rawRecords, syncRuns, wallets } from '../schema/index.ts';
import { createTestDatabase, resetDatabase } from '../testing/test-db.ts';
import { upsertAssets } from './assets.ts';
import { insertBalanceSnapshots, startSyncRun } from './portfolio.ts';
import { saveRawRecords } from './raw.ts';
import { addWallet, removeWallet } from './wallets.ts';

const { db, close } = createTestDatabase();
beforeEach(() => resetDatabase(db));
afterAll(() => close());

const KEEP = '0x00000000000000000000000000000000000000aa';
const DROP = '0x00000000000000000000000000000000000000bb';

/** A wallet on both EVM chains, each with one sync run holding one balance snapshot. */
async function walletWithHistory(address: string, name: string) {
  const { wallet, accounts: rows } = await addWallet(db, { address, name });
  const assets = await upsertAssets(db, [
    {
      ref: 'eip155:1/slip44:60',
      chainId: 'eip155:1',
      kind: 'native',
      address: null,
      symbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      decimalsSource: 'test',
      metadataSource: 'test',
      initialStatus: 'verified',
    },
  ]);
  const eth = assets.get('eip155:1/slip44:60');
  for (const account of rows) {
    const [raw] = await saveRawRecords(db, [
      {
        provider: 'test',
        requestKey: `balances(${account.ref})`,
        payload: { n: 1 },
        fetchedAt: new Date(),
      },
    ]);
    const run = await startSyncRun(db, account.id, new Date());
    await insertBalanceSnapshots(db, [
      {
        syncRunId: run,
        accountId: account.id,
        assetId: eth?.id as string,
        rawAmount: 10n ** 18n,
        observedAt: new Date(),
        rawRecordId: raw as string,
      },
    ]);
  }
  return wallet;
}

describe('removeWallet', () => {
  it('deletes the wallet, its accounts, sync runs, and snapshots, and keeps raw records', async () => {
    const keep = await walletWithHistory(KEEP, 'Keep');
    const drop = await walletWithHistory(DROP, 'Drop');
    const rawBefore = await db.$count(rawRecords);

    const removed = await removeWallet(db, drop.id);
    expect(removed).toMatchObject({ wallet: { name: 'Drop' }, accounts: 2 });

    expect((await db.select().from(wallets)).map((w) => w.name)).toEqual(['Keep']);
    const left = await db.select().from(accounts);
    expect(left.every((a) => a.walletId === keep.id)).toBe(true);
    expect(left).toHaveLength(2);
    expect(await db.$count(syncRuns)).toBe(2);
    expect(await db.$count(balanceSnapshots)).toBe(2);
    expect(
      await db.$count(balanceSnapshots, eq(balanceSnapshots.accountId, left[0]?.id as string)),
    ).toBe(1);
    // Provider responses are immutable records of what was seen; removal never touches them.
    expect(await db.$count(rawRecords)).toBe(rawBefore);
  });

  it('rejects an unknown wallet', async () => {
    await expect(removeWallet(db, '01a0e4bb-6c32-76e6-9590-ce717185cfff')).rejects.toThrow(
      'Unknown wallet',
    );
  });
});
