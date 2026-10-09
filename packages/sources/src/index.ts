import type { ChainKey, Venue } from '@talewinds/core';
import { createBitcoinBalanceSource } from './chains/bitcoin/index.ts';
import { createEvmBalanceSource, type EvmChainKey, type EvmClients } from './chains/evm/index.ts';
import { createSolanaBalanceSource } from './chains/solana/index.ts';
import { alchemyUrl, CHAIN_PROVIDERS } from './config.ts';
import type { SourcesEnv } from './env.ts';
import { createPriceSource } from './prices/index.ts';
import { type FetchFn, ProviderClient } from './shared/http.ts';
import type { Sleep } from './shared/limiter.ts';
import type {
  PriceSource,
  VenueBalanceSource,
  VenuePriceSource,
  WalletBalanceSource,
} from './types.ts';
import { coinbaseAuthorizer } from './venues/coinbase/auth.ts';
import { createCoinbaseBalanceSource } from './venues/coinbase/index.ts';
import { createCoinbasePriceSource } from './venues/coinbase/prices.ts';
import { createHyperliquidBalanceSource } from './venues/hyperliquid/index.ts';
import { createHyperliquidPriceSource } from './venues/hyperliquid/prices.ts';
import { combineVenuePrices } from './venues/index.ts';

export { SourcesEnv } from './env.ts';
export { ProviderError } from './shared/errors.ts';
export type { FetchFn } from './shared/http.ts';
export { RequestMeter } from './shared/meter.ts';
export type * from './types.ts';
export { KeyPermissionError } from './venues/coinbase/index.ts';

/** How each chain is currently being read, for status displays. Contains no secrets. */
export interface SourceDescription {
  chain: ChainKey;
  rpc: 'custom' | 'public';
  tokenDiscovery: 'blockscout' | 'alchemy' | 'solana-rpc' | 'none' | 'unavailable';
}

export interface Sources {
  wallets: Record<ChainKey, WalletBalanceSource>;
  prices: PriceSource;
  /** Readers for venue accounts; null where the venue isn't configured (or built) yet. */
  venueBalances: Record<Venue, VenueBalanceSource | null>;
  /** Prices for venue assets, on each venue's own markets (ADR 0018). */
  venuePrices: VenuePriceSource;
  describe(): SourceDescription[];
  /** Which venues can be read (Coinbase needs its key; Hyperliquid is public). No secrets. */
  venues: { coinbase: boolean; hyperliquid: boolean };
}

export interface SourcesOptions {
  /** Injected in tests to serve recorded fixtures instead of calling providers. */
  fetch?: FetchFn;
  sleep?: Sleep;
}

/**
 * Build every adapter from configuration. Clients are created once per process so rate limits
 * are shared across all callers.
 */
export function createSources(env: SourcesEnv, options: SourcesOptions = {}): Sources {
  if (Boolean(env.COINBASE_API_KEY_NAME) !== Boolean(env.COINBASE_API_PRIVATE_KEY)) {
    throw new Error('Set both COINBASE_API_KEY_NAME and COINBASE_API_PRIVATE_KEY, or neither');
  }
  const secrets = [
    env.ALCHEMY_API_KEY,
    env.ETHEREUM_RPC_URL,
    env.ROBINHOOD_RPC_URL,
    env.SOLANA_RPC_URL,
    env.COINBASE_API_PRIVATE_KEY,
  ].filter((v): v is string => Boolean(v));
  const client = (
    provider: string,
    baseUrl: string,
    minIntervalMs: number,
    timeoutMs?: number,
    maxRetries?: number,
  ) =>
    new ProviderClient({
      provider,
      baseUrl,
      minIntervalMs,
      redact: secrets,
      ...(timeoutMs ? { timeoutMs } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...options,
    });
  const description: SourceDescription[] = [];

  const evm = (key: EvmChainKey, overrideUrl: string | undefined): WalletBalanceSource => {
    const cfg = CHAIN_PROVIDERS[key];
    const alchemy =
      env.ALCHEMY_API_KEY && cfg.alchemyNetwork
        ? client(`alchemy:${key}`, alchemyUrl(cfg.alchemyNetwork, env.ALCHEMY_API_KEY), 100)
        : null;

    // Native balances use the public (or custom) RPC. Alchemy is only for token discovery, so a
    // key problem (e.g. a network not enabled in the Alchemy app) can't hide native balances.
    const rpc = overrideUrl
      ? client(`rpc:${key}:custom`, overrideUrl, 100)
      : client(`rpc:${key}:public`, cfg.publicRpcUrl, cfg.publicRpcIntervalMs);

    let discovery: EvmClients['discovery'];
    if (cfg.tokenDiscovery === 'blockscout' && cfg.blockscoutUrl) {
      // One response lists every token; heavily airdropped wallets return several MB.
      discovery = {
        kind: 'blockscout',
        client: client(`blockscout:${key}`, cfg.blockscoutUrl, 400, 90_000),
      };
    } else if (cfg.tokenDiscovery === 'alchemy' && alchemy) {
      discovery = { kind: 'alchemy', client: alchemy };
    } else {
      discovery = {
        kind: 'unavailable',
        reason: `Token balances on this chain need ALCHEMY_API_KEY; only the native balance was read.`,
      };
    }

    description.push({
      chain: key,
      rpc: overrideUrl ? 'custom' : 'public',
      tokenDiscovery: discovery.kind,
    });
    return createEvmBalanceSource(key, { rpc, discovery });
  };

  const jupiter = client('jupiter', 'https://lite-api.jup.ag', 1100);
  const btc = CHAIN_PROVIDERS.bitcoin;
  const wallets: Record<ChainKey, WalletBalanceSource> = {
    // Bitcoin: Esplora, public and keyless (step 02a). With a fallback ready, the primary gets one
    // retry, not three, so an outage costs seconds rather than most of a minute.
    bitcoin: createBitcoinBalanceSource({
      primary: client(
        `esplora:${new URL(btc.publicRpcUrl).hostname}`,
        btc.publicRpcUrl,
        btc.publicRpcIntervalMs,
        10_000,
        btc.fallbackUrl ? 1 : undefined,
      ),
      ...(btc.fallbackUrl
        ? {
            fallback: client(
              `esplora:${new URL(btc.fallbackUrl).hostname}`,
              btc.fallbackUrl,
              btc.publicRpcIntervalMs,
            ),
          }
        : {}),
    }),
    ethereum: evm('ethereum', env.ETHEREUM_RPC_URL),
    robinhood: evm('robinhood', env.ROBINHOOD_RPC_URL),
    solana: createSolanaBalanceSource({
      rpc: env.SOLANA_RPC_URL
        ? client('rpc:solana:custom', env.SOLANA_RPC_URL, 100)
        : client(
            'rpc:solana:public',
            CHAIN_PROVIDERS.solana.publicRpcUrl,
            CHAIN_PROVIDERS.solana.publicRpcIntervalMs,
          ),
      jupiter,
    }),
  };
  description.push({
    chain: 'solana',
    rpc: env.SOLANA_RPC_URL ? 'custom' : 'public',
    tokenDiscovery: 'solana-rpc',
  });

  description.push({ chain: 'bitcoin', rpc: 'public', tokenDiscovery: 'none' });

  const prices = createPriceSource({
    defillama: client('defillama', 'https://coins.llama.fi', 250),
    dexscreener: client('dexscreener', 'https://api.dexscreener.com', 400),
    // Shared with the Solana adapter so both respect one rate limit.
    jupiter,
  });

  // Coinbase (ADR 0017): signed with a view-only key, checked before every read. The key is only
  // parsed when a request is made, so processes that never sync (the API) never load it.
  const coinbase =
    env.COINBASE_API_KEY_NAME && env.COINBASE_API_PRIVATE_KEY
      ? createCoinbaseBalanceSource(
          new ProviderClient({
            provider: 'coinbase',
            baseUrl: 'https://api.coinbase.com',
            minIntervalMs: 150,
            redact: secrets,
            authorize: coinbaseAuthorizer({
              keyName: env.COINBASE_API_KEY_NAME,
              privateKeyPem: env.COINBASE_API_PRIVATE_KEY,
            }),
            ...options,
          }),
        )
      : null;
  // Hyperliquid's info API is public: balances by address, prices from its own markets.
  const hyperliquid = client('hyperliquid', 'https://api.hyperliquid.xyz', 250);
  // Venue holdings are priced on each venue's own public market data (no key).
  const venuePrices = combineVenuePrices({
    coinbase: createCoinbasePriceSource(client('coinbase:market', 'https://api.coinbase.com', 150)),
    hyperliquid: createHyperliquidPriceSource(hyperliquid),
  });

  return {
    wallets,
    prices,
    venueBalances: { coinbase, hyperliquid: createHyperliquidBalanceSource(hyperliquid) },
    venuePrices,
    describe: () => description,
    venues: { coinbase: coinbase !== null, hyperliquid: true },
  };
}
