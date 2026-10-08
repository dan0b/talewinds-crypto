import {
  type AssetRef,
  type ChainKey,
  Dec,
  type Note,
  type PriceConfidence,
} from '@talewinds/core';
import { JUPITER_BATCH, jupiterTokenInfo } from '../chains/solana/jupiter.ts';
import { CHAIN_PROVIDERS } from '../config.ts';
import type { ProviderClient } from '../shared/http.ts';
import type { PriceQuote, PriceReading, PriceSource, PricingInput, RawCapture } from '../types.ts';
import {
  DEFILLAMA_BATCH,
  defillamaMarketCaps,
  defillamaPrices,
  type LlamaPrice,
} from './defillama.ts';
import {
  DEXSCREENER_BATCH,
  dexscreenerPrices,
  HIGH_CONFIDENCE_LIQUIDITY_USD,
} from './dexscreener.ts';

export interface PriceClients {
  defillama: ProviderClient;
  dexscreener: ProviderClient;
  jupiter: ProviderClient;
}

/** Per-refresh request caps, so a wallet full of airdropped junk can't exhaust free tiers. */
export interface PriceLimits {
  maxDefillamaRequests: number;
  maxJupiterRequests: number;
  maxDexscreenerRequests: number;
}

const DEFAULT_LIMITS: PriceLimits = {
  maxDefillamaRequests: 20,
  maxJupiterRequests: 10,
  maxDexscreenerRequests: 5,
};

/** On-chain and DefiLlama prices further apart than this are flagged as a disagreement. */
export const MAX_SOURCE_DEVIATION = 0.25;

interface MarketObservation {
  source: string;
  priceUsd: string;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  pricedAt: Date;
  captureIndex: number;
}

const usdString = (n: number | null | undefined) =>
  n != null && Number.isFinite(n) && n >= 0 ? String(n) : null;

/** |a − b| / b, with exact decimals. */
export function deviation(a: string, b: string): number {
  const base = new Dec(b);
  if (base.isZero()) return Number.POSITIVE_INFINITY;
  return new Dec(a).minus(base).abs().div(base).toNumber();
}

/**
 * Market quotes for held assets (ADR 0015):
 *  - native assets: DefiLlama price + DefiLlama market cap;
 *  - tokens: on-chain markets first (Jupiter on Solana, the deepest DexScreener pool on EVM), with
 *    DefiLlama as a cross-check. A disagreement beyond MAX_SOURCE_DEVIATION keeps the on-chain
 *    price, drops confidence to low, and is reported;
 *  - tokens without an on-chain market fall back to DefiLlama.
 * Inputs should be ordered by priority: request caps cut from the end.
 */
export function createPriceSource(
  clients: PriceClients,
  limits: PriceLimits = DEFAULT_LIMITS,
): PriceSource {
  return {
    async fetchPrices(inputs, { meter }): Promise<PriceReading> {
      const captures: RawCapture[] = [];
      const notes: Note[] = [];
      const keep = (raw: RawCapture) => captures.push(raw) - 1;

      const llamaBudget = limits.maxDefillamaRequests * DEFILLAMA_BATCH;
      const considered = inputs.slice(0, llamaBudget);
      if (inputs.length > llamaBudget) {
        notes.push({
          code: 'price_cap',
          message: `${inputs.length - llamaBudget} assets not priced this round (request cap); they'll be tried later.`,
        });
      }

      // 1. DefiLlama: native prices, and a cross-check for every token.
      const llama = new Map<string, LlamaPrice & { captureIndex: number }>();
      for (let i = 0; i < considered.length; i += DEFILLAMA_BATCH) {
        const batch = considered.slice(i, i + DEFILLAMA_BATCH);
        const res = await defillamaPrices(clients.defillama, batch, meter);
        const index = keep(res.raw);
        for (const [ref, p] of res.data) llama.set(ref, { ...p, captureIndex: index });
      }

      // 2. Native market caps (one request covers every native asset).
      const natives = considered.filter((i) => i.kind === 'native');
      const nativeCaps = new Map<string, number>();
      if (natives.length > 0) {
        const ids = natives.map((i) => CHAIN_PROVIDERS[i.chainKey].nativeCoingeckoId);
        const res = await defillamaMarketCaps(clients.defillama, ids, meter);
        keep(res.raw);
        for (const [id, mcap] of res.data) nativeCaps.set(id, mcap);
      }

      // 3. On-chain markets for tokens, within per-source caps.
      const onchain = new Map<string, MarketObservation>();
      const onchainAsked = new Set<string>();
      const tokens = considered.filter((i) => i.kind === 'token' && i.address);

      const solana = tokens.filter((i) => i.chainKey === 'solana');
      for (
        let i = 0, n = 0;
        i < solana.length && n < limits.maxJupiterRequests;
        i += JUPITER_BATCH, n++
      ) {
        const batch = solana.slice(i, i + JUPITER_BATCH);
        for (const input of batch) onchainAsked.add(input.ref);
        const mints = batch.map((b) => b.address as string);
        const res = await jupiterTokenInfo(clients.jupiter, mints, meter);
        const index = keep(res.raw);
        for (const input of batch) {
          const t = res.data.get(input.address as string);
          const price = usdString(t?.usdPrice);
          if (!t || !price || new Dec(price).isZero()) continue;
          onchain.set(input.ref, {
            source: 'jupiter',
            priceUsd: price,
            liquidityUsd: t.liquidity ?? null,
            marketCapUsd: t.mcap ?? null,
            fdvUsd: t.fdv ?? null,
            pricedAt: t.updatedAt ? new Date(t.updatedAt) : res.raw.fetchedAt,
            captureIndex: index,
          });
        }
      }

      const evmByChain = new Map<ChainKey, PricingInput[]>();
      for (const input of tokens.filter((i) => i.chainKey !== 'solana')) {
        evmByChain.set(input.chainKey, [...(evmByChain.get(input.chainKey) ?? []), input]);
      }
      let dexRequests = 0;
      for (const group of evmByChain.values()) {
        for (let i = 0; i < group.length; i += DEXSCREENER_BATCH) {
          if (dexRequests >= limits.maxDexscreenerRequests) break;
          dexRequests++;
          const batch = group.slice(i, i + DEXSCREENER_BATCH);
          for (const input of batch) onchainAsked.add(input.ref);
          const res = await dexscreenerPrices(clients.dexscreener, batch, meter);
          const index = keep(res.raw);
          for (const [ref, p] of res.data) {
            onchain.set(ref, {
              source: 'dexscreener',
              priceUsd: p.priceUsd,
              liquidityUsd: p.liquidityUsd,
              marketCapUsd: p.marketCapUsd,
              fdvUsd: p.fdvUsd,
              pricedAt: res.raw.fetchedAt,
              captureIndex: index,
            });
          }
        }
      }

      // 4. Choose one quote per asset.
      const quotes: PriceQuote[] = [];
      const missing: AssetRef[] = [];
      let disagreements = 0;
      let unchecked = 0;

      for (const input of considered) {
        const ll = llama.get(input.ref);

        if (input.kind === 'native') {
          if (!ll) {
            missing.push(input.ref);
            continue;
          }
          const caps = nativeCaps.get(CHAIN_PROVIDERS[input.chainKey].nativeCoingeckoId);
          quotes.push({
            ref: input.ref,
            priceUsd: ll.priceUsd,
            confidence: ll.confidence,
            pricedAt: ll.pricedAt,
            source: 'defillama',
            captureIndex: ll.captureIndex,
            marketCapUsd: usdString(caps),
            fdvUsd: null,
            liquidityUsd: null,
            crossCheck: null,
            verifies: true,
          });
          continue;
        }

        const oc = onchain.get(input.ref);
        if (oc) {
          const disagrees = ll ? deviation(ll.priceUsd, oc.priceUsd) > MAX_SOURCE_DEVIATION : false;
          if (disagrees) disagreements++;
          const deep = oc.liquidityUsd !== null && oc.liquidityUsd >= HIGH_CONFIDENCE_LIQUIDITY_USD;
          const confidence: PriceConfidence = deep && !disagrees ? 'high' : 'low';
          quotes.push({
            ref: input.ref,
            priceUsd: oc.priceUsd,
            confidence,
            pricedAt: oc.pricedAt,
            source: oc.source,
            captureIndex: oc.captureIndex,
            marketCapUsd: usdString(oc.marketCapUsd),
            fdvUsd: usdString(oc.fdvUsd),
            liquidityUsd: usdString(oc.liquidityUsd),
            crossCheck: disagrees && ll ? { source: 'defillama', priceUsd: ll.priceUsd } : null,
            // Verification needs an independent, reliable source that agrees with the market.
            verifies: Boolean(ll && ll.confidence === 'high' && !disagrees),
          });
          continue;
        }

        if (ll) {
          // No on-chain market found, or the on-chain check was skipped by the request cap.
          const checked = onchainAsked.has(input.ref);
          if (!checked) unchecked++;
          quotes.push({
            ref: input.ref,
            priceUsd: ll.priceUsd,
            confidence: checked ? ll.confidence : 'low',
            pricedAt: ll.pricedAt,
            source: 'defillama',
            captureIndex: ll.captureIndex,
            marketCapUsd: null,
            fdvUsd: null,
            liquidityUsd: null,
            crossCheck: null,
            verifies: checked && ll.confidence === 'high',
          });
          continue;
        }

        // "Missing" means every applicable source was asked and none knew it; tokens skipped by
        // a cap are retried next round instead.
        if (onchainAsked.has(input.ref)) missing.push(input.ref);
      }

      if (disagreements > 0) {
        notes.push({
          code: 'price_disagreement',
          message: `${disagreements} tokens: DefiLlama's price differs from the on-chain market by more than ${MAX_SOURCE_DEVIATION * 100}%; the on-chain price is used.`,
        });
      }
      if (unchecked > 0) {
        notes.push({
          code: 'onchain_check_skipped',
          message: `${unchecked} tokens priced by DefiLlama only (on-chain check skipped by the request cap); shown as low confidence.`,
        });
      }
      return { captures, quotes, missing, notes };
    },
  };
}
