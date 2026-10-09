# Build log: 02a — Bitcoin wallets

- **Date:** 2026-10-08
- **Brief:** [02a-bitcoin-wallets](../briefs/02a-bitcoin-wallets.md)

## Summary

Bitcoin is a supported chain. Paste any mainnet address into "Add wallet": legacy (`1…`), P2SH
(`3…`, Xverse's usual payment address), native SegWit (`bc1q…`), or Taproot (`bc1p…`, Xverse's
ordinals address). It syncs from mempool.space, falling back to Blockstream. BTC is priced like the
other native coins and counts toward the BTC coin together with WBTC.

## What was built

- **Core:** the chain `bitcoin` (CAIP-2 `bip122:000000000019d6689c085ae165831e93`, family
  `bitcoin`, BTC with 8 decimals, SLIP-44 coin type 0). `bitcoin.ts` adds pure SHA-256, base58,
  base58check, and bech32/bech32m (BIP173, BIP350), mainnet only; it's pure because the dashboard
  validates addresses in the browser. `bitcoinAddressType` returns `p2pkh`, `p2sh`, `p2wpkh`,
  `p2wsh`, `p2tr`, or null. Bech32 addresses are stored lowercase. The coin registry maps coin type
  0 to `btc`.
- **Solana validation tightened:** an address must now decode to exactly 32 bytes. Bitcoin's base58
  addresses use the same alphabet but decode to 25 bytes, so they can never pass as Solana.
  Detection checks Bitcoin before Solana as well.
- **Database:** migration `0006_bitcoin_wallets` widens the wallets family check. `ensureWallet` takes
  any chain family.
- **Sources:** `chains/bitcoin` reads an Esplora API (`/api/address/{address}`). Only confirmed coins
  count (funded minus spent); an unconfirmed change becomes a note ("+0.00004218 BTC is unconfirmed
  (incoming)…"). A Taproot address gets a note that its inscriptions, runes, and BRC-20 tokens aren't
  read. An outage (5xx or a timeout) moves to Blockstream, with a note; a rejected address doesn't.
- **Dashboard and CLI:** the Add wallet form and `tw wallet add` accept Bitcoin addresses (with a
  checksum hint on typos). Wallet cards and the scope picker show "Bitcoin", and the System page
  lists the chain.

## Deviations from the brief

None.

## Verification performed

- **Test vectors** for SHA-256 (FIPS 180-2, including a 1,000-byte multi-block message) and Bitcoin
  addresses (BIP173 and BIP350 examples, the genesis address, a known P2SH address) were re-checked
  independently with Python's `hashlib` and the BIPs' reference bech32 algorithm before being used
  as tests. Invalid cases cover a wrong checksum, testnet, mixed case, a v1 address with the old
  checksum, and an EVM address.
- **Live, through the new code (read only, nothing stored):** the genesis address returned
  57.58276965 BTC, with +4,218 sats unconfirmed noted; Blockstream returned the identical confirmed
  balance. The Bitfinex-hack native SegWit address returned 94,643.48825813 BTC.
- `pnpm check` passes: **119 unit tests** (from 109) and 23 integration tests.

## Known gaps

- **Your Xverse balances aren't checked yet**, because you haven't added the addresses. Add both
  from the dashboard ("Add wallet"); name them, e.g., "Xverse · payment" and "Xverse · ordinals".
- Inscriptions, runes, and BRC-20 tokens aren't read (their sats are counted as BTC).
- No xpub scanning: each address is added on its own.

## Next steps

- **[02b Categories and themes](../briefs/02b-categories-and-themes.md).**

## Follow-up (2026-10-09)

- **Blockstream is now the primary source and mempool.space the fallback.** mempool.space began
  resetting TLS handshakes from here, which made each Bitcoin sync wait about 50 seconds before
  falling back. The primary now gets one retry and a 10-second timeout when a fallback exists.
  See the [02d build log](2026-10-09-remove-a-wallet.md).
- **Your Xverse payment address syncs:** "XVerse BTC" read 0.05196367 BTC (via the fallback, on its
  first sync).

