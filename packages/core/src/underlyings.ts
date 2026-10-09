import { z } from 'zod';
import { AssetRef, parseVenueAssetRef } from './assets.ts';
import { CHAINS } from './chains.ts';

/**
 * Underlying grouping (ADR 0019): the coin each asset gives exposure to, so ETH on Ethereum, ETH
 * on Robinhood Chain, WETH, rsETH, and ETH at Coinbase count as one ETH. Hand-curated and
 * reviewed; anything not listed is its own coin, never matched by ticker or name.
 *
 * Groupings sum **USD values**, never token amounts: one rsETH isn't one ETH.
 */
export const UNDERLYINGS = {
  eth: { symbol: 'ETH', name: 'Ether' },
  btc: { symbol: 'BTC', name: 'Bitcoin' },
  sol: { symbol: 'SOL', name: 'Solana' },
  usdc: { symbol: 'USDC', name: 'USD Coin' },
  usdt: { symbol: 'USDT', name: 'Tether' },
  usd: { symbol: 'USD', name: 'US dollar' },
} as const satisfies Record<string, { symbol: string; name: string }>;
export type UnderlyingId = keyof typeof UNDERLYINGS;

/** How an asset holds its coin. Stablecoins are their own coins, so USDC is USDC's native form. */
export const FORMS = ['native', 'wrapped', 'staked', 'restaked', 'venue'] as const;
export type Form = (typeof FORMS)[number];

export interface UnderlyingLink {
  underlying: UnderlyingId;
  form: Form;
}

/** Native assets map by SLIP-44 coin type: identity, not a ticker (ETH's gas on any EVM chain). */
const NATIVE_COIN_TYPES: Record<string, UnderlyingId> = { '0': 'btc', '60': 'eth', '501': 'sol' };

const ETH = CHAINS.ethereum.id;
const ROBINHOOD = CHAINS.robinhood.id;
const SOL = CHAINS.solana.id;

/**
 * Tokens by exact asset ID. Each entry was checked on 2026-10-08 against on-chain metadata (Blockscout
 * or Jupiter) and DefiLlama (confidence 0.99), unless its comment says otherwise. Add entries the
 * same way, and say how you verified them.
 */
export const TOKEN_UNDERLYINGS: Record<string, UnderlyingLink> = {
  [`${ETH}/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`]: {
    underlying: 'eth',
    form: 'wrapped',
  }, // WETH
  [`${ETH}/erc20:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0`]: {
    underlying: 'eth',
    form: 'staked',
  }, // wstETH (Lido)
  [`${ETH}/erc20:0xa35b1b31ce002fbf2058d22f30f95d405200a15b`]: {
    underlying: 'eth',
    form: 'staked',
  }, // ETHx (Stader)
  [`${ETH}/erc20:0xa2e3356610840701bdf5611a53974510ae27e2e1`]: {
    underlying: 'eth',
    form: 'staked',
  }, // wBETH (Binance)
  [`${ETH}/erc20:0xa1290d69c65a6fe4df752f95823fae25cb99e5a7`]: {
    underlying: 'eth',
    form: 'restaked',
  }, // rsETH (Kelp DAO)
  [`${ETH}/erc20:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599`]: {
    underlying: 'btc',
    form: 'wrapped',
  }, // WBTC
  [`${ETH}/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`]: {
    underlying: 'usdc',
    form: 'native',
  }, // USDC (Circle)
  [`${ETH}/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7`]: {
    underlying: 'usdt',
    form: 'native',
  }, // USDT (Tether)
  // WETH on Robinhood Chain: the deepest DexScreener pool's base token (WETH/USDG), recorded
  // 2026-09-28 in packages/sources/test/fixtures/dexscreener-robinhood.json.
  [`${ROBINHOOD}/erc20:0x0bd7d308f8e1639fab988df18a8011f41eacad73`]: {
    underlying: 'eth',
    form: 'wrapped',
  },
  [`${SOL}/token:So11111111111111111111111111111111111111112`]: {
    underlying: 'sol',
    form: 'wrapped',
  }, // wSOL
  [`${SOL}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`]: {
    underlying: 'usdc',
    form: 'native',
  }, // USDC (Circle)
  [`${SOL}/token:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`]: {
    underlying: 'usdt',
    form: 'native',
  }, // USDT (Tether)
  [`${SOL}/token:3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh`]: {
    underlying: 'btc',
    form: 'wrapped',
  }, // WBTC (Portal)
};

/** What each venue means by its own currency codes (ADR 0018); never a ticker match elsewhere. */
const VENUE_CODES: Record<string, Record<string, UnderlyingId>> = {
  coinbase: { ETH: 'eth', BTC: 'btc', SOL: 'sol', USDC: 'usdc', USDT: 'usdt', USD: 'usd' },
  // Hyperliquid's USDC: its quote currency, bridged 1:1 from Circle's USDC (Arbitrum).
  hyperliquid: { USDC: 'usdc' },
};

/** The coin an asset gives exposure to, and in what form; null when it isn't in the registry. */
export function underlyingOf(ref: string): UnderlyingLink | null {
  const token = TOKEN_UNDERLYINGS[ref];
  if (token) return token;
  const native = /\/slip44:(\d+)$/.exec(ref);
  if (native) {
    const id = NATIVE_COIN_TYPES[native[1] as string];
    return id ? { underlying: id, form: 'native' } : null;
  }
  const venue = parseVenueAssetRef(ref);
  if (venue) {
    const id = VENUE_CODES[venue.venue]?.[venue.code];
    return id ? { underlying: id, form: 'venue' } : null;
  }
  return null;
}

/**
 * How a coin is identified for tags and groupings (step 02b): a registry coin's ID (`eth`), or
 * the asset's own ref for a coin outside the registry (HOOKR is its own coin).
 */
export const CoinKey = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((key) => Object.hasOwn(UNDERLYINGS, key) || AssetRef.safeParse(key).success, {
    message: 'Expected a coin: a registry ID like eth, or an asset ID like eip155:1/erc20:0x…',
  });

/** Your labels for coins: one category each (Major, Speculative…), any number of themes. */
export const TAG_KINDS = ['category', 'theme'] as const;
export const TagKind = z.enum(TAG_KINDS);
export type TagKind = z.infer<typeof TagKind>;
export const TagName = z.string().trim().min(1, 'A tag needs a name').max(40);
