import { describe, expect, it } from 'vitest';
import {
  chartNumber,
  direction,
  formatAmount,
  formatChangePct,
  formatChangeUsd,
  formatCompactUsd,
  formatPrice,
  formatShare,
  formatTickUsd,
  formatUsd,
  shareFraction,
  shortAddress,
  timeAgo,
} from './format.ts';

describe('display formatting', () => {
  it('formats token amounts without float error or false precision', () => {
    expect(formatAmount('91486991.768633631334996918')).toBe('91,486,991.7686');
    expect(formatAmount('0.000000001')).toBe('0.000000001');
    expect(formatAmount('2')).toBe('2');
    expect(formatAmount('0')).toBe('0');
  });

  it('formats USD values and prices', () => {
    expect(formatUsd('243320932322.27')).toBe('$243,320,932,322.27');
    expect(formatUsd('0.004')).toBe('$0.00');
    expect(formatPrice('2659.6232712254427')).toBe('$2,659.62');
    expect(formatPrice('0.9996712208235482')).toBe('$0.9997');
    expect(formatPrice('0.0000000180699236393543')).toBe('$0.00000001807');
  });

  it('formats market caps compactly', () => {
    expect(formatCompactUsd('196049.07')).toBe('$196K');
    expect(formatCompactUsd('36219.73')).toBe('$36.2K');
    expect(formatCompactUsd('325522063099.2363')).toBe('$326B');
    expect(formatCompactUsd('5496547350')).toBe('$5.5B');
    expect(formatCompactUsd('812.5')).toBe('$812.50');
  });

  it('formats ages and addresses', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(timeAgo('2026-09-28T11:58:00Z', now)).toBe('2m ago');
    expect(timeAgo(null, now)).toBe('never');
    expect(shortAddress('0x0bd7d308f8e1639fab988df18a8011f41eacad73')).toBe('0x0bd7…ad73');
  });

  it('formats shares of a total', () => {
    expect(formatShare('0.421215')).toBe('42.1%');
    expect(formatShare('1')).toBe('100.0%');
    expect(formatShare('0.000410')).toBe('<0.1%');
    expect(formatShare('0')).toBe('0%');
  });

  it('formats signed changes, never as a negative zero', () => {
    expect(formatChangePct('-0.019507')).toBe('−1.95%');
    expect(formatChangePct('0.25')).toBe('+25.00%');
    expect(formatChangePct('12.5')).toBe('+1,250.00%');
    expect(formatChangePct('-0.00001')).toBe('0.00%');
    expect(formatChangeUsd('-31.28')).toBe('−$31.28');
    expect(formatChangeUsd('1234.5')).toBe('+$1,234.50');
    expect(formatChangeUsd('-0.004')).toBe('$0.00');
    expect(direction('-31.28')).toBe('down');
    expect(direction('0.001')).toBe('flat');
    expect(direction('0.000123', 6)).toBe('up');
  });

  it('turns shares into bounded fractions for chart geometry', () => {
    expect(shareFraction('0.421215')).toBeCloseTo(0.421215);
    expect(shareFraction('1.000001')).toBe(1);
  });

  it('labels axis ticks compactly, without float noise', () => {
    expect(formatTickUsd(0)).toBe('$0');
    expect(formatTickUsd(500)).toBe('$500');
    expect(formatTickUsd(40_000)).toBe('$40K');
    expect(formatTickUsd(40_500)).toBe('$40.5K');
    expect(formatTickUsd(1_250_000)).toBe('$1.25M');
    expect(formatTickUsd(0.15000000000000002)).toBe('$0.15');
  });

  it('turns USD into numbers for chart geometry only', () => {
    expect(chartNumber('40734.80')).toBe(40734.8);
    expect(chartNumber('0.004')).toBe(0);
  });
});
