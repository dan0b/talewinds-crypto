import { z } from 'zod';
import { normalizeAddress } from './addresses.ts';
import type { ChainInfo } from './chains.ts';

/**
 * Asset identity uses CAIP-19 (`<chain>/<namespace>:<reference>`):
 *  - native:  `eip155:1/slip44:60`, `solana:5eyk…/slip44:501`
 *  - EVM token: `eip155:4663/erc20:0xabc…` (lowercased)
 *  - SPL token: `solana:5eyk…/token:<mint>` (case preserved)
 * https://chainagnostic.org/CAIPs/caip-19
 */
export const AssetRef = z
  .string()
  .regex(
    /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}\/[-a-z0-9]{3,8}:[-.%a-zA-Z0-9]{1,128}$/,
    'Expected a CAIP-19 asset ID like eip155:1/erc20:0xabc…',
  )
  .brand<'AssetRef'>();
export type AssetRef = z.infer<typeof AssetRef>;

export const ASSET_KINDS = ['native', 'token'] as const;
export const AssetKind = z.enum(ASSET_KINDS);
export type AssetKind = z.infer<typeof AssetKind>;

/**
 * Whether an asset is shown and counted (ADR 0014):
 *  - verified:   native, reliably priced, provider-verified, or marked verified by you. Counted.
 *  - unverified: unknown. Hidden by default, excluded from totals, never dropped.
 *  - spam:       marked spam by you. Hidden and excluded.
 */
export const ASSET_STATUSES = ['verified', 'unverified', 'spam'] as const;
export const AssetStatus = z.enum(ASSET_STATUSES);
export type AssetStatus = z.infer<typeof AssetStatus>;

/** Who set an asset's status. Manual decisions always win over automatic rules. */
export const STATUS_SOURCES = ['auto', 'manual'] as const;
export const StatusSource = z.enum(STATUS_SOURCES);
export type StatusSource = z.infer<typeof StatusSource>;

/** How much a price can be trusted. `low` prices are shown with a warning. */
export const PRICE_CONFIDENCES = ['high', 'low'] as const;
export const PriceConfidence = z.enum(PRICE_CONFIDENCES);
export type PriceConfidence = z.infer<typeof PriceConfidence>;

export function nativeAssetRef(chain: ChainInfo): AssetRef {
  return AssetRef.parse(`${chain.id}/slip44:${chain.nativeSlip44}`);
}

export function tokenAssetRef(chain: ChainInfo, address: string): AssetRef {
  const namespace = chain.family === 'evm' ? 'erc20' : 'token';
  return AssetRef.parse(`${chain.id}/${namespace}:${normalizeAddress(chain.family, address)}`);
}

export const MAX_SYMBOL_LENGTH = 24;
export const MAX_NAME_LENGTH = 64;

// Control characters, plus bidirectional overrides/isolates used to visually spoof text.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/**
 * Token symbols and names are attacker-controlled (a live Robinhood Chain token has a symbol
 * thousands of characters long). Strip unsafe characters, collapse whitespace, and cap the
 * length. Returns null for empty results. Output is display text only — never interpret it.
 */
export function sanitizeTokenText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const chars = Array.from(cleaned); // count code points, not UTF-16 units
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 1).join('')}…` : cleaned;
}
