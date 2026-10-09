import {
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
  BalanceContext,
  BalanceReading,
  ObservedBalance,
  RawCapture,
  VenueBalanceSource,
} from '../../types.ts';

const Amount = z.object({ value: z.string(), currency: z.string() });

export const KeyPermissions = z.object({
  can_view: z.boolean(),
  can_trade: z.boolean(),
  can_transfer: z.boolean(),
  /** The one portfolio this key reads. */
  portfolio_uuid: z.string().optional(),
  portfolio_type: z.string().optional(),
});
export type KeyPermissions = z.infer<typeof KeyPermissions>;

const AccountsPage = z.object({
  accounts: z.array(
    z.object({
      uuid: z.string(),
      currency: z.string(),
      /** Exact decimal strings (unlike the portfolio breakdown's floats). */
      available_balance: Amount,
      hold: Amount.optional(),
      type: z.string().optional(),
    }),
  ),
  has_next: z.boolean(),
  cursor: z.string().optional(),
});

const NumberText = z.union([z.number(), z.string()]);
const Breakdown = z.object({
  breakdown: z.object({
    spot_positions: z
      .array(
        z.object({
          asset: z.string(),
          account_type: z.string().optional(),
          total_balance_crypto: NumberText.optional(),
          total_balance_fiat: NumberText.optional(),
        }),
      )
      .optional(),
  }),
});

/** 250 accounts a page: far more than any real account has. Hitting it is reported. */
const MAX_ACCOUNT_PAGES = 20;

/** The key may read but not trade or move money (ADR 0017); anything else is refused. */
export class KeyPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyPermissionError';
  }
}

export function assertViewOnly(p: KeyPermissions): void {
  const extra = [p.can_trade && 'trade', p.can_transfer && 'transfer'].filter(Boolean);
  if (extra.length > 0) {
    throw new KeyPermissionError(
      `The Coinbase API key can ${extra.join(' and ')}, so it won't be used. Create a key with View permission only (ADR 0017).`,
    );
  }
  if (!p.can_view) {
    throw new KeyPermissionError(
      "The Coinbase API key has no View permission, so it can't read balances.",
    );
  }
}

/** Approximate staked value for a note: printed provider numbers, summed exactly, labeled "about". */
const approxUsd = (values: (number | string | undefined)[]) =>
  values.reduce<Dec>((sum, v) => sum.plus(new Dec(String(v ?? 0))), new Dec(0)).toFixed(2);

/**
 * Every balance in the Coinbase portfolio the key reads (ADR 0018): crypto and cash, available plus
 * on hold, from exact decimal strings. The key's permissions are checked first (ADR 0017).
 */
export function createCoinbaseBalanceSource(client: ProviderClient): VenueBalanceSource {
  return {
    venue: 'coinbase',
    // The account is whatever the key reads, so the account reference isn't needed.
    async fetchBalances(_account, { meter }: BalanceContext): Promise<BalanceReading> {
      const captures: RawCapture[] = [];
      const keep = (raw: RawCapture) => captures.push(raw) - 1;
      const notes: Note[] = [];
      let complete = true;

      // 1. Before reading anything: is this key view-only? A failure here fails the sync.
      const permissions = await client.getJson(
        '/api/v3/brokerage/key_permissions',
        KeyPermissions,
        { meter, requestKey: 'key_permissions' },
      );
      keep(permissions.raw);
      assertViewOnly(permissions.data);

      // 2. Every account, page by page. Accounts sharing a currency (e.g. a vault) are summed.
      const totals = new Map<string, { raw: bigint; captureIndex: number }>();
      let cursor: string | undefined;
      for (let page = 1; ; page++) {
        const query = new URLSearchParams({ limit: '250', ...(cursor ? { cursor } : {}) });
        const res = await client.getJson(`/api/v3/brokerage/accounts?${query}`, AccountsPage, {
          meter,
          requestKey: `accounts(page ${page})`,
        });
        const index = keep(res.raw);
        for (const account of res.data.accounts) {
          let raw: bigint;
          try {
            raw =
              parseRawAmount(account.available_balance.value, VENUE_DECIMALS) +
              parseRawAmount(account.hold?.value ?? '0', VENUE_DECIMALS);
          } catch {
            complete = false;
            notes.push({
              code: 'venue_amount_unreadable',
              message: `Skipped a ${account.currency} balance Coinbase reported in a form that can't be read exactly.`,
            });
            continue;
          }
          if (raw <= 0n) continue;
          const prev = totals.get(account.currency);
          totals.set(account.currency, {
            raw: (prev?.raw ?? 0n) + raw,
            captureIndex: prev?.captureIndex ?? index,
          });
        }
        if (!res.data.has_next || !res.data.cursor) break;
        if (page >= MAX_ACCOUNT_PAGES) {
          complete = false;
          notes.push({
            code: 'venue_page_cap',
            message: `Stopped after ${MAX_ACCOUNT_PAGES} pages of Coinbase accounts; some balances may be missing.`,
          });
          break;
        }
        cursor = res.data.cursor;
      }

      const balances: ObservedBalance[] = [];
      for (const [code, total] of totals) {
        let ref: ReturnType<typeof venueAssetRef>;
        try {
          ref = venueAssetRef('coinbase', code);
        } catch {
          complete = false;
          notes.push({
            code: 'venue_code_unusable',
            message: 'Skipped a Coinbase balance whose currency code cannot form an asset ID.',
          });
          continue;
        }
        balances.push({
          asset: {
            ref,
            chainId: VENUE_INFO.coinbase.chainId,
            kind: 'venue',
            address: null,
            symbol: sanitizeTokenText(code, MAX_SYMBOL_LENGTH),
            name: null,
            decimals: VENUE_DECIMALS,
            decimalsSource: 'venue',
            metadataSource: 'coinbase',
            // The venue vouches for what it lists; spam can't land in a venue account.
            providerVerified: true,
          },
          rawAmount: rawAmount(total.raw),
          captureIndex: total.captureIndex,
        });
      }

      // 3. Staked funds appear only in the portfolio breakdown, as floats: report, never add.
      const portfolio = permissions.data.portfolio_uuid;
      if (!portfolio) {
        complete = false;
        notes.push({
          code: 'venue_staked_unchecked',
          message: "Couldn't check Coinbase for staked funds: the key reports no portfolio.",
        });
      } else {
        try {
          const res = await client.getJson(
            `/api/v3/brokerage/portfolios/${encodeURIComponent(portfolio)}`,
            Breakdown,
            { meter, requestKey: 'portfolio_breakdown' },
          );
          keep(res.raw);
          const staked = (res.data.breakdown.spot_positions ?? []).filter(
            (p) =>
              p.account_type === 'ACCOUNT_TYPE_STAKED_FUNDS' &&
              new Dec(String(p.total_balance_crypto ?? 0)).gt(0),
          );
          if (staked.length > 0) {
            complete = false;
            notes.push({
              code: 'venue_staked_not_included',
              message: `Coinbase reports staked ${staked.map((p) => p.asset).join(', ')} worth about $${approxUsd(staked.map((p) => p.total_balance_fiat))} that isn't included yet.`,
            });
          }
        } catch (err) {
          complete = false;
          notes.push({
            code: 'venue_staked_unchecked',
            message: `Couldn't check Coinbase for staked funds (${err instanceof Error ? err.message : 'unknown error'}).`,
          });
        }
      }

      return { captures, balances, notes, complete };
    },
  };
}
