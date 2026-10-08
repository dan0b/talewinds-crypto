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
