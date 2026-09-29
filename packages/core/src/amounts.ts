import Decimal from 'decimal.js';

/**
 * Money and token math. Two rules, no exceptions:
 *  1. On-chain quantities are integers in the token's smallest unit and are
 *     always `bigint` (a uint256 does not fit in a JS number).
 *  2. Human-scale values (prices, USD values, rates) are `Decimal`.
 * JavaScript `number` is never used for either.
 */

/** Integer amount in a token's smallest unit (wei, lamports, …). */
export type RawAmount = bigint & { readonly __brand: 'RawAmount' };

export const rawAmount = (value: bigint | string): RawAmount => {
  const v = typeof value === 'bigint' ? value : BigInt(value);
  return v as RawAmount;
};

/** Precise enough for 78-digit uint256 values plus 18+ decimal places. */
export const Dec = Decimal.clone({ precision: 100, rounding: Decimal.ROUND_HALF_EVEN });
export type Dec = Decimal;

/** 1500000000000000000n with 18 decimals -> "1.5" */
export function formatRawAmount(raw: RawAmount, decimals: number): string {
  if (decimals === 0) return raw.toString();
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** "1.5" with 18 decimals -> 1500000000000000000n. Rejects excess precision. */
export function parseRawAmount(value: string, decimals: number): RawAmount {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`Not a decimal amount: ${value}`);
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > decimals) {
    throw new Error(`Amount ${value} has more than ${decimals} decimal places`);
  }
  const raw = BigInt(whole + fraction.padEnd(decimals, '0'));
  return rawAmount(sign ? -raw : raw);
}

/** Raw amount -> Decimal token quantity, for multiplying by prices. */
export function rawToDec(raw: RawAmount, decimals: number): Dec {
  return new Dec(raw.toString()).div(new Dec(10).pow(decimals));
}

/**
 * `JSON.stringify` throws on bigint. Use this replacer (or `toJson`) anywhere
 * data crosses a JSON boundary; bigints and Decimals become strings.
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Decimal.isDecimal(value)) return value.toString();
  return value;
}

export const toJson = (value: unknown): string => JSON.stringify(value, jsonReplacer);
