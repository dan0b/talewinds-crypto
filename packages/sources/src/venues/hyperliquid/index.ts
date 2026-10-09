import {
  type AssetRef,
  Dec,
  MAX_SYMBOL_LENGTH,
  type Note,
  parseRawAmount,
  rawAmount,
  sanitizeTokenText,
  VENUE_DECIMALS,
  VENUE_INFO,
  venueAssetRef,
} from '@talewinds/core';
import { z } from 'zod';
import type { ProviderClient } from '../../shared/http.ts';
import type {
  BalanceReading,
  ObservedBalance,
  RawCapture,
  VenueAccount,
  VenueBalanceSource,
} from '../../types.ts';

/** Hyperliquid reports amounts as exact decimal strings. */
const DecimalText = z.string().regex(/^-?\d+(\.\d+)?$/);

const SpotState = z.object({
  balances: z.array(
    z.object({
      coin: z.string(),
      token: z.number(),
      /** The whole balance, including what's on hold in open orders. */
      total: DecimalText,
      hold: DecimalText,
    }),
  ),
});

const PerpsState = z.object({
  marginSummary: z.object({ accountValue: DecimalText }),
  assetPositions: z.array(z.unknown()),
});

const VaultEquities = z.array(z.object({ vaultAddress: z.string(), equity: DecimalText }));

const DelegatorSummary = z.object({
  delegated: DecimalText,
  undelegated: DecimalText,
  totalPendingWithdrawal: DecimalText,
});

const SubAccounts = z.array(z.object({ subAccountUser: z.string() }).passthrough()).nullable();

/** Hyperliquid's quote currency: every spot market and the perps account are denominated in it. */
export const HYPERLIQUID_QUOTE = 'USDC';

const asset = (code: string, ref: AssetRef) => ({
  ref,
  chainId: VENUE_INFO.hyperliquid.chainId,
  kind: 'venue' as const,
  address: null,
  symbol: sanitizeTokenText(code, MAX_SYMBOL_LENGTH),
  name: null,
  decimals: VENUE_DECIMALS,
  decimalsSource: 'venue',
  metadataSource: 'hyperliquid',
  // The venue vouches for what it lists; balances can't be airdropped spam into a venue account.
  providerVerified: true,
});

/**
 * Everything a Hyperliquid account holds, read by address from the public info API (no key):
 * spot balances (including amounts on hold), plus the perps account's value, which already
 * includes unrealized P&L and is counted as USDC. Vault deposits, staked HYPE, and sub-accounts
 * aren't read yet; any found are reported as gaps, never left out silently (ADR 0018).
 */
export function createHyperliquidBalanceSource(client: ProviderClient): VenueBalanceSource {
  return {
    venue: 'hyperliquid',
    async fetchBalances(account: VenueAccount, { meter }): Promise<BalanceReading> {
      const user = account.address;
      if (!user) throw new Error('A Hyperliquid account needs its 0x address');
      const captures: RawCapture[] = [];
      const keep = (raw: RawCapture) => captures.push(raw) - 1;
      const notes: Note[] = [];
      let complete = true;
      const ask = <S extends z.ZodType>(type: string, schema: S) =>
        client.postJson('/info', { type, user }, schema, {
          meter,
          requestKey: `${type}(${user})`,
        });

      // 1. Spot balances: exact decimal strings, `total` includes what's on hold.
      const spot = await ask('spotClearinghouseState', SpotState);
      const spotIndex = keep(spot.raw);
      const totals = new Map<string, { raw: bigint; captureIndex: number }>();
      for (const b of spot.data.balances) {
        const raw = parseRawAmount(b.total, VENUE_DECIMALS);
        if (raw > 0n) totals.set(b.coin, { raw, captureIndex: spotIndex });
      }

      // 2. Perps: the account's value (margin + unrealized P&L) is what you'd have in USDC.
      const perps = await ask('clearinghouseState', PerpsState);
      const perpsIndex = keep(perps.raw);
      const equity = new Dec(perps.data.marginSummary.accountValue);
      if (equity.gt(0)) {
        const prev = totals.get(HYPERLIQUID_QUOTE);
        totals.set(HYPERLIQUID_QUOTE, {
          raw: (prev?.raw ?? 0n) + parseRawAmount(equity.toFixed(), VENUE_DECIMALS),
          captureIndex: prev?.captureIndex ?? perpsIndex,
        });
        notes.push({
          code: 'venue_perps_equity_included',
          message: `USDC includes $${equity.toFixed(2)} of perps account value (margin plus unrealized P&L).`,
        });
      }
      const open = perps.data.assetPositions.length;
      if (open > 0) {
        notes.push({
          code: 'venue_positions_not_shown',
          message: `${open} open perp ${open === 1 ? 'position is' : 'positions are'} counted in the account value but not listed yet.`,
        });
      }

      // 3. Holdings this version doesn't read yet: report them, so the total is visibly incomplete.
      const vaults = await ask('userVaultEquities', VaultEquities);
      keep(vaults.raw);
      const inVaults = vaults.data.reduce((s, v) => s.plus(v.equity), new Dec(0));
      if (inVaults.gt(0)) {
        complete = false;
        notes.push({
          code: 'venue_vaults_not_included',
          message: `Vault deposits (${vaults.data.length}, worth about $${inVaults.toFixed(2)}) aren't included yet.`,
        });
      }

      const staking = await ask('delegatorSummary', DelegatorSummary);
      keep(staking.raw);
      const staked = new Dec(staking.data.delegated)
        .plus(staking.data.undelegated)
        .plus(staking.data.totalPendingWithdrawal);
      if (staked.gt(0)) {
        complete = false;
        notes.push({
          code: 'venue_staked_not_included',
          message: `Staked HYPE (${staked.toFixed()} HYPE) isn't included yet.`,
        });
      }

      const subs = await ask('subAccounts', SubAccounts);
      keep(subs.raw);
      if (subs.data && subs.data.length > 0) {
        complete = false;
        notes.push({
          code: 'venue_sub_accounts_not_included',
          message: `This account has ${subs.data.length} sub-${subs.data.length === 1 ? 'account' : 'accounts'}; add each one as its own Hyperliquid account to include it.`,
        });
      }

      const balances: ObservedBalance[] = [];
      for (const [code, total] of totals) {
        let ref: AssetRef;
        try {
          ref = venueAssetRef('hyperliquid', code);
        } catch {
          complete = false;
          notes.push({
            code: 'venue_code_unusable',
            message: 'Skipped a Hyperliquid balance whose token name cannot form an asset ID.',
          });
          continue;
        }
        balances.push({
          asset: asset(code, ref),
          rawAmount: rawAmount(total.raw),
          captureIndex: total.captureIndex,
        });
      }
      return { captures, balances, notes, complete };
    },
  };
}
