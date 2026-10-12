import { Dec } from '@talewinds/core';

/**
 * Display formatting only. Amounts and values arrive as decimal strings and are formatted with
 * exact decimal math; nothing here is used for calculations.
 */

const group = (integer: string) => integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function trimZeros(fixed: string): string {
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** Token amounts: grouped, up to 4 decimals; tiny amounts keep 4 significant digits. */
export function formatAmount(value: string): string {
  const d = new Dec(value);
  if (d.isZero()) return '0';
  if (d.abs().lt(0.0001)) return d.toSignificantDigits(4).toFixed();
  const [int = '0', frac] = trimZeros(d.toFixed(4, Dec.ROUND_DOWN)).split('.');
  return frac ? `${group(int)}.${frac}` : group(int);
}

/** USD values: $1,234.56. */
export function formatUsd(value: string): string {
  const d = new Dec(value);
  const [int = '0', frac = '00'] = d.abs().toFixed(2).split('.');
  return `${d.isNegative() ? '−' : ''}$${group(int)}.${frac}`;
}

/** Prices: cents for $1+, significant digits below that. */
export function formatPrice(value: string): string {
  const d = new Dec(value);
  if (d.gte(1)) return formatUsd(d.toFixed(d.gte(1000) ? 2 : 4)).replace(/(\.\d{2})0{1,2}$/, '$1');
  return `$${d.toSignificantDigits(4).toFixed()}`;
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function shortAddress(address: string | null): string {
  if (!address) return '';
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

const COMPACT: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** Large USD amounts, compactly: $36.2K, $196K, $325B. Falls back to cents below $1,000. */
export function formatCompactUsd(value: string): string {
  const d = new Dec(value);
  const abs = d.abs();
  for (const [unit, suffix] of COMPACT) {
    if (abs.gte(unit)) {
      const scaled = d.div(unit);
      return `$${scaled.toFixed(scaled.abs().gte(100) ? 0 : 1)}${suffix}`;
    }
  }
  return formatUsd(value);
}

/** A share of a total: "0.421215" → "42.1%". Tiny non-zero shares show as "<0.1%". */
export function formatShare(share: string): string {
  const pct = new Dec(share).times(100);
  if (pct.isZero()) return '0%';
  if (pct.abs().lt(0.1)) return '<0.1%';
  return `${pct.toFixed(1)}%`;
}

/** A signed fractional change: "-0.019507" → "−1.95%", "0.25" → "+25.00%". */
export function formatChangePct(pct: string): string {
  const d = new Dec(pct).times(100);
  const [int = '0', frac = '00'] = d.abs().toFixed(2).split('.');
  if (int === '0' && frac === '00') return '0.00%';
  return `${d.isNegative() ? '−' : '+'}${group(int)}.${frac}%`;
}

/** A signed USD change: "+$12.34", "−$31.28"; a change that rounds to zero is "$0.00". */
export function formatChangeUsd(value: string): string {
  const d = new Dec(value);
  const cents = d.abs().toFixed(2);
  if (cents === '0.00') return '$0.00';
  return `${d.isNegative() ? '−' : '+'}${formatUsd(cents)}`;
}

/** Which way a signed decimal points, at the precision it's displayed with. */
export function direction(value: string, decimals = 2): 'up' | 'down' | 'flat' {
  const d = new Dec(value);
  if (d.abs().toFixed(decimals) === new Dec(0).toFixed(decimals)) return 'flat';
  return d.isNegative() ? 'down' : 'up';
}

/**
 * A share as a plain number between 0 and 1, **for chart geometry only** (SVG angles and bar
 * widths). Never use it for money: values and shares stay decimal strings everywhere else.
 */
export function shareFraction(share: string): number {
  return Math.min(1, Math.max(0, Number(new Dec(share).toFixed(6))));
}

/**
 * A USD amount as a plain number, **for chart geometry only** (a point's height on an axis). The
 * value itself stays a decimal string: format it with `formatUsd`, never from this number.
 */
export function chartNumber(value: string): number {
  return Number(new Dec(value).toFixed(2));
}

/**
 * An axis tick (a round number the chart chose, not a value from the data): "$0", "$500",
 * "$40K", "$40.5K", "$1.25M". Float noise from the tick arithmetic is dropped first.
 */
export function formatTickUsd(tick: number): string {
  const d = new Dec(String(Number(tick.toPrecision(12))));
  const sign = d.isNegative() ? '−' : '';
  for (const [unit, suffix] of COMPACT) {
    if (d.abs().gte(unit)) return `${sign}$${trimZeros(d.abs().div(unit).toFixed(2))}${suffix}`;
  }
  return d.isInteger() ? `${sign}$${d.abs().toFixed(0)}` : formatUsd(d.toFixed(2));
}
