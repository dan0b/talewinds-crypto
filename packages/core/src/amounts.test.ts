import { describe, expect, it } from 'vitest';
import { formatRawAmount, parseRawAmount, rawAmount, rawToDec, toJson } from './amounts.ts';

describe('raw amounts', () => {
  it('round-trips values larger than Number.MAX_SAFE_INTEGER', () => {
    const maxUint256 = 2n ** 256n - 1n;
    const formatted = formatRawAmount(rawAmount(maxUint256), 18);
    expect(parseRawAmount(formatted, 18)).toBe(maxUint256);
  });

  it('formats with trimmed trailing zeros', () => {
    expect(formatRawAmount(rawAmount(1_500_000_000_000_000_000n), 18)).toBe('1.5');
    expect(formatRawAmount(rawAmount(1n), 9)).toBe('0.000000001');
    expect(formatRawAmount(rawAmount(-2_000_000_000n), 9)).toBe('-2');
    expect(formatRawAmount(rawAmount(42n), 0)).toBe('42');
  });

  it('rejects more precision than the token supports', () => {
    expect(() => parseRawAmount('0.0000000001', 9)).toThrow(/decimal places/);
    expect(() => parseRawAmount('1e18', 18)).toThrow(/Not a decimal/);
  });

  it('converts to Decimal without float error', () => {
    // 0.1 + 0.2 style errors are exactly what floats would introduce here.
    const a = rawToDec(parseRawAmount('0.1', 18), 18);
    const b = rawToDec(parseRawAmount('0.2', 18), 18);
    expect(a.plus(b).toString()).toBe('0.3');
  });
});

describe('toJson', () => {
  it('serializes bigint and Decimal instead of throwing', () => {
    const json = toJson({ raw: 10n ** 30n, price: rawToDec(rawAmount(15n), 1) });
    expect(json).toBe('{"raw":"1000000000000000000000000000000","price":"1.5"}');
  });
});
