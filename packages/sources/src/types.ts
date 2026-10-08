import type {
  AssetKind,
  AssetRef,
  ChainId,
  ChainKey,
  Note,
  PriceConfidence,
  RawAmount,
} from '@talewinds/core';
import type { RequestMeter } from './shared/meter.ts';

/** A provider response exactly as received, ready to store as a raw record. */
export interface RawCapture {
  provider: string;
  requestKey: string;
  payload: unknown;
  fetchedAt: Date;
}

/** An asset as a provider described it, after validation and sanitizing. */
export interface ObservedAsset {
  ref: AssetRef;
  chainId: ChainId;
  kind: AssetKind;
  address: string | null;
  symbol: string | null;
  name: string | null;
  decimals: number;
  decimalsSource: string;
  metadataSource: string | null;
  /** The provider vouches for this asset (a chain's native asset, a Jupiter-verified mint). */
  providerVerified: boolean;
}

export interface ObservedBalance {
  asset: ObservedAsset;
  rawAmount: RawAmount;
  /** Index into `BalanceReading.captures` of the response this balance came from. */
  captureIndex: number;
}

export interface BalanceReading {
  captures: RawCapture[];
  balances: ObservedBalance[];
  /** What couldn't be seen or was skipped. */
  notes: Note[];
  /** False when something couldn't be read (the sync is then `partial`). */
  complete: boolean;
}

/** What we already know about an asset, so adapters can skip redundant metadata calls. */
export type KnownAssetLookup = (ref: AssetRef) => { decimals: number } | undefined;

export interface BalanceContext {
  meter: RequestMeter;
  known: KnownAssetLookup;
}

/** Reads every balance an address holds on one chain. */
export interface WalletBalanceSource {
  readonly chainKey: ChainKey;
  fetchBalances(address: string, ctx: BalanceContext): Promise<BalanceReading>;
}

export interface PricingInput {
  ref: AssetRef;
  chainKey: ChainKey;
  kind: AssetKind;
  address: string | null;
}

export interface PriceQuote {
  ref: AssetRef;
  /** Decimal string, e.g. "2661.17". Never a float for math. */
  priceUsd: string;
  confidence: PriceConfidence;
  pricedAt: Date;
  source: string;
  captureIndex: number;
  /** Decimal strings from the same source, when it provides them. */
  marketCapUsd: string | null;
  fdvUsd: string | null;
  /** Depth of the market the price came from (deepest pool / aggregated liquidity). */
  liquidityUsd: string | null;
  /** A second source that disagreed beyond the threshold (the quote is then low confidence). */
  crossCheck: { source: string; priceUsd: string } | null;
  /** Reliable enough to mark the asset verified automatically (ADR 0015). */
  verifies: boolean;
}

export interface PriceReading {
  captures: RawCapture[];
  quotes: PriceQuote[];
  /** Refs no source could price in this run. */
  missing: AssetRef[];
  notes: Note[];
}

export interface PriceSource {
  fetchPrices(inputs: PricingInput[], ctx: { meter: RequestMeter }): Promise<PriceReading>;
}
